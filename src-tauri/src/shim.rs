use std::fs;
use std::path::PathBuf;
use std::env;
use std::process::Command;

fn get_paths() -> Option<(PathBuf, PathBuf)> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    let services_dir = home.join(".stackmanager").join("services");
    let bin_dir = home.join(".stackmanager").join("bin");

    Some((services_dir, bin_dir))
}

#[tauri::command]
pub fn get_active_version(service: String) -> Result<String, String> {
    let (_, bin_dir) = get_paths().ok_or("Home not found")?;
    let link_path = bin_dir.join(&service);

    if fs::symlink_metadata(&link_path).is_err() {
        return Ok("Not Set".to_string());
    }

    match fs::read_link(&link_path) {
        Ok(target) => {
            Ok(target.file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or("Unknown".to_string()))
        },
        Err(_) => Ok("Unknown".to_string()) 
    }
}

#[tauri::command]
pub fn set_active_version(service: String, version_folder: String) -> Result<String, String> {
    let (services_dir, bin_dir) = get_paths().ok_or("Could not find home directory")?;
    
    let base_target = services_dir.join(&version_folder);
    let mut target_path = base_target.clone();

    let exe_name = if cfg!(target_os = "windows") { "php.exe" } else { "php" };
    
    if !target_path.join(exe_name).exists() {
        let nested = target_path.join(&version_folder);
        if nested.join(exe_name).exists() {
            target_path = nested;
        }
    }
    
    if !target_path.exists() {
        return Err(format!("Target version not found at {:?}", target_path));
    }

    let link_path = bin_dir.join(&service);

    if fs::symlink_metadata(&link_path).is_ok() {
        #[cfg(target_os = "windows")]
        {
            if fs::remove_dir(&link_path).is_err() {
                if fs::remove_file(&link_path).is_err() {
                    let _ = Command::new("cmd")
                        .args(&["/C", "rmdir", "/S", "/Q", &link_path.to_string_lossy()])
                        .output();
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        let _ = fs::remove_file(&link_path);
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(&["/C", "mklink", "/J", &link_path.to_string_lossy(), &target_path.to_string_lossy()])
            .output()
            .map_err(|e| format!("Failed to execute mklink: {}", e))?;

        if !status.status.success() {
            if !link_path.exists() {
                 return Err(format!("Mklink failed: {}", String::from_utf8_lossy(&status.stderr)));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::symlink;
        symlink(&target_path, &link_path).map_err(|e| format!("Unix Symlink Error: {}", e))?;
    }

    Ok(format!("Global {} set to {}", service, version_folder))
}
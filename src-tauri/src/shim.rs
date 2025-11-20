use std::fs;
use std::path::PathBuf;
use std::env;
use std::process::Command;

// Helper to get the base paths
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

    // Use symlink_metadata to check existence even if the link is broken
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
    
    // 1. Find the actual source folder containing the executable
    let base_target = services_dir.join(&version_folder);
    let mut target_path = base_target.clone();

    // Check if executable is nested (common with zips)
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

    // 2. Aggressively remove existing link/junction
    // We use symlink_metadata because .exists() returns false for broken links
    if fs::symlink_metadata(&link_path).is_ok() {
        #[cfg(target_os = "windows")]
        {
            // Try removing as directory (Junction)
            if fs::remove_dir(&link_path).is_err() {
                // Try removing as file (Symlink)
                if fs::remove_file(&link_path).is_err() {
                    // Force remove with CMD if Rust fails
                    let _ = Command::new("cmd")
                        .args(&["/C", "rmdir", "/S", "/Q", &link_path.to_string_lossy()])
                        .output();
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        let _ = fs::remove_file(&link_path);
    }

    // 3. Create the new Junction (Windows) or Symlink (Unix)
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(&["/C", "mklink", "/J", &link_path.to_string_lossy(), &target_path.to_string_lossy()])
            .output()
            .map_err(|e| format!("Failed to execute mklink: {}", e))?;

        if !status.status.success() {
            // Sometimes mklink complains but works. Check if it exists now.
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
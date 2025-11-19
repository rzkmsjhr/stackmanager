use std::fs;
use std::path::PathBuf;
use std::env;

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
pub fn set_active_version(service: String, version_folder: String) -> Result<String, String> {
    let (services_dir, bin_dir) = get_paths().ok_or("Could not find home directory")?;
    
    // 1. The real folder (e.g., .../services/php-8.2.10)
    let target_path = services_dir.join(&version_folder);
    
    // 2. The "Shim" link (e.g., .../bin/php)
    // Note: We link the whole FOLDER, so bin/php becomes a mirror of php-8.2.10
    let link_path = bin_dir.join(&service);

    if !target_path.exists() {
        return Err(format!("Target version not found: {:?}", target_path));
    }

    // 3. Remove existing link if it exists
    if link_path.exists() {
        // We use remove_dir_all to be safe, though remove_file often works for symlinks too
        // In Rust, removing a symlink directory usually requires remove_dir
        #[cfg(target_os = "windows")]
        let _ = fs::remove_dir(&link_path); 
        #[cfg(not(target_os = "windows"))]
        let _ = fs::remove_file(&link_path);
    }

    // 4. Create the new Symlink
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::symlink_dir;
        // Windows requires "Developer Mode" enabled or Admin privileges for this
        symlink_dir(&target_path, &link_path).map_err(|e| format!("Win Error: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::symlink;
        symlink(&target_path, &link_path).map_err(|e| format!("Unix Error: {}", e))?;
    }

    Ok(format!("Active {} switched to {}", service, version_folder))
}
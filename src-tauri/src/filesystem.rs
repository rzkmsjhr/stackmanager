use std::fs;
use std::path::PathBuf;
use std::env;

// Helper function to get home directory safely on any OS
// This avoids relying on Tauri APIs that change between versions.
fn get_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        env::var("HOME").ok().map(PathBuf::from)
    }
}

#[tauri::command]
pub fn init_environment() -> Result<String, String> {
    // 1. Get the User's Home Directory safely
    let home = get_home_dir().ok_or("Could not find home directory")?;
    
    // 2. Define our root path: ~/.stackmanager (or %USERPROFILE%\.stackmanager)
    let root_path = home.join(".stackmanager");
    let services_path = root_path.join("services");
    let bin_path = root_path.join("bin");

    // 3. Create directories safely
    if !root_path.exists() {
        fs::create_dir_all(&root_path).map_err(|e| e.to_string())?;
    }
    if !services_path.exists() {
        fs::create_dir_all(&services_path).map_err(|e| e.to_string())?;
    }
    if !bin_path.exists() {
        fs::create_dir_all(&bin_path).map_err(|e| e.to_string())?;
    }

    Ok(format!("Environment initialized at {:?}", root_path))
}

#[tauri::command]
pub fn get_services() -> Result<Vec<String>, String> {
    let home = get_home_dir().ok_or("Could not find home directory")?;
    let services_path = home.join(".stackmanager").join("services");

    if !services_path.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(services_path).map_err(|e| e.to_string())?;
    
    let mut services = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    if let Ok(name) = entry.file_name().into_string() {
                        services.push(name);
                    }
                }
            }
        }
    }
    
    Ok(services)
}
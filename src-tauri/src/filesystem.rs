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

#[tauri::command]
pub fn get_service_bin_path(service_name: String) -> Result<String, String> {
    let home = get_home_dir().ok_or("Could not find home directory")?;
    let services_path = home.join(".stackmanager").join("services");
    let base_path = services_path.join(&service_name);

    if !base_path.exists() {
        return Err(format!("Service {} not installed", service_name));
    }

    // Logic to find the executable folder (bin)
    // 1. Check for direct 'bin'
    let direct_bin = base_path.join("bin");
    if direct_bin.exists() {
        return Ok(direct_bin.to_string_lossy().to_string());
    }

    // 2. Check for nested folder with same name (e.g. mariadb/mariadb/bin)
    let nested_bin = base_path.join(&service_name).join("bin");
    if nested_bin.exists() {
        return Ok(nested_bin.to_string_lossy().to_string());
    }
    
    // 3. Fallback: Look for ANY subfolder that has a 'bin' inside
    if let Ok(entries) = fs::read_dir(&base_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                 if file_type.is_dir() {
                     let candidate = entry.path().join("bin");
                     if candidate.exists() {
                         return Ok(candidate.to_string_lossy().to_string());
                     }
                 }
            }
        }
     }

    // If no bin found, maybe the executable is in root (some tools do this)
    Ok(base_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_user_home() -> Result<String, String> {
    let home = get_home_dir().ok_or("Home not found")?;
    Ok(home.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_service_folder(folder_name: String) -> Result<String, String> {
    let home = get_home_dir().ok_or("Could not find home directory")?;
    let services_path = home.join(".stackmanager").join("services");
    let target_path = services_path.join(&folder_name);

    // Safety Check: Ensure the target is actually inside the services directory
    // and prevents ".." traversal attacks or deleting root.
    if !target_path.starts_with(&services_path) {
        return Err("Invalid path: Cannot delete outside of services directory".to_string());
    }

    if !target_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    // Perform Deletion
    fs::remove_dir_all(&target_path).map_err(|e| e.to_string())?;

    Ok(format!("Deleted {}", folder_name))
}
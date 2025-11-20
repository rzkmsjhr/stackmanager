use std::fs;
use std::path::PathBuf;
use std::env;
use std::collections::HashMap;

// Helper function to get home directory safely on any OS
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
    let home = get_home_dir().ok_or("Could not find home directory")?;
    let root_path = home.join(".stackmanager");
    let services_path = root_path.join("services");
    let bin_path = root_path.join("bin");

    if !root_path.exists() { fs::create_dir_all(&root_path).map_err(|e| e.to_string())?; }
    if !services_path.exists() { fs::create_dir_all(&services_path).map_err(|e| e.to_string())?; }
    if !bin_path.exists() { fs::create_dir_all(&bin_path).map_err(|e| e.to_string())?; }

    Ok(format!("Environment initialized at {:?}", root_path))
}

#[tauri::command]
pub fn get_services() -> Result<Vec<String>, String> {
    let home = get_home_dir().ok_or("Could not find home directory")?;
    let services_path = home.join(".stackmanager").join("services");

    if !services_path.exists() { return Ok(vec![]); }

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

    if !base_path.exists() { return Err(format!("Service {} not installed", service_name)); }

    let direct_bin = base_path.join("bin");
    if direct_bin.exists() { return Ok(direct_bin.to_string_lossy().to_string()); }

    let nested_bin = base_path.join(&service_name).join("bin");
    if nested_bin.exists() { return Ok(nested_bin.to_string_lossy().to_string()); }
    
    if let Ok(entries) = fs::read_dir(&base_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                 if file_type.is_dir() {
                     let candidate = entry.path().join("bin");
                     if candidate.exists() { return Ok(candidate.to_string_lossy().to_string()); }
                 }
            }
        }
     }
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

    if !target_path.starts_with(&services_path) { return Err("Invalid path".to_string()); }
    if !target_path.exists() { return Err("Folder does not exist".to_string()); }

    fs::remove_dir_all(&target_path).map_err(|e| e.to_string())?;
    Ok(format!("Deleted {}", folder_name))
}

// --- NEW COMMANDS FOR PROJECT MANAGEMENT ---

#[tauri::command]
pub fn delete_project_dir(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    // Basic safety: don't delete short paths (roots/home)
    // This prevents accidents like deleting "C:\" or "/Users/name"
    if let Some(parent) = path_buf.parent() {
        if parent.components().count() < 1 {
             return Err("Path is too close to root. Operation unsafe.".to_string());
        }
    } else {
        return Err("Cannot delete root directory".to_string());
    }
    
    fs::remove_dir_all(&path_buf).map_err(|e| e.to_string())?;
    Ok("Project files deleted successfully".to_string())
}

#[tauri::command]
pub fn check_projects_status(paths: Vec<String>) -> HashMap<String, bool> {
    let mut status = HashMap::new();
    for path in paths {
        let exists = PathBuf::from(&path).exists();
        status.insert(path, exists);
    }
    status
}
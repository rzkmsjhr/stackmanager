use std::fs;
use std::path::PathBuf;
use std::env;
use tauri::command;

fn get_store_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    Some(home.join(".stackmanager").join("projects.json"))
}

#[command]
pub fn save_projects(data: String) -> Result<String, String> {
    let path = get_store_path().ok_or("Could not find home directory")?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok("Saved".to_string())
}

#[command]
pub fn load_projects() -> Result<String, String> {
    let path = get_store_path().ok_or("Could not find home directory")?;
    
    if !path.exists() {
        return Ok("[]".to_string());
    }

    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(data)
}
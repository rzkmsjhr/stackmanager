use std::process::Command;
use std::path::PathBuf;
use std::env;
use std::fs;

fn get_paths() -> Option<(PathBuf, PathBuf)> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    let services = home.join(".stackmanager").join("services");
    let data = home.join(".stackmanager").join("data").join("mysql");

    Some((services, data))
}

#[tauri::command]
pub fn init_mysql(version_folder: String) -> Result<String, String> {
    let (services_dir, data_dir) = get_paths().ok_or("Home dir not found")?;
    
    let base_path = services_dir.join(&version_folder);
    
    let mut mysql_bin = base_path.join("bin");
    
    if !mysql_bin.exists() {
        // Try nested: services/mariadb-ver/mariadb-ver/bin
        let nested = base_path.join(&version_folder).join("bin");
        if nested.exists() {
            mysql_bin = nested;
        } else {
             // Fallback: Search for ANY folder that contains "bin"
             if let Ok(entries) = fs::read_dir(&base_path) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                         if file_type.is_dir() {
                             let candidate = entry.path().join("bin");
                             if candidate.exists() {
                                 mysql_bin = candidate;
                                 break;
                             }
                         }
                    }
                }
             }
        }
    }
    
    // Validate executable exists
    let install_db_exe = mysql_bin.join("mysql_install_db.exe");
    if !install_db_exe.exists() {
        return Err(format!("Could not find mysql_install_db.exe at {:?}", install_db_exe));
    }

    // --- End Fix ---

    if data_dir.exists() && data_dir.join("mysql").exists() {
        return Ok("Database already initialized.".to_string());
    }

    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    println!("Initializing MySQL from: {:?}", install_db_exe);
    
    let output = Command::new(&install_db_exe)
        .arg(format!("--datadir={}", data_dir.to_string_lossy()))
        .output()
        .map_err(|e| format!("Failed to execute init: {}", e))?;

    if output.status.success() {
        Ok("MySQL Data Directory Initialized!".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Init failed: {}", err))
    }
}
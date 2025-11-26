use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::env;

fn get_home() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    return env::var("USERPROFILE").ok().map(PathBuf::from);
    #[cfg(not(target_os = "windows"))]
    return env::var("HOME").ok().map(PathBuf::from);
}

fn find_bin_path(base_dir: &PathBuf, exe_name: &str) -> Option<PathBuf> {
    let direct = base_dir.join("bin").join(exe_name);
    if direct.exists() { return Some(direct); }

    if let Ok(entries) = fs::read_dir(base_dir) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let nested = entry.path().join("bin").join(exe_name);
                    if nested.exists() { return Some(nested); }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn init_mysql(version_folder: String) -> Result<String, String> {
    let home = get_home().ok_or("Home not found")?;
    let base = home.join(".stackmanager");
    let service_dir = base.join("services").join(&version_folder);

    let data_dir = base.join("data").join("mysql");
    
    if data_dir.join("mysql").exists() {
        return Ok("MariaDB already initialized".to_string());
    }

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    let install_db_exe = find_bin_path(&service_dir, "mysql_install_db.exe")
        .ok_or(format!("Could not find mysql_install_db.exe in {}", version_folder))?;

    println!("Initializing MariaDB with: {:?}", install_db_exe);

    let output = Command::new(install_db_exe)
        .arg(format!("--datadir={}", data_dir.to_string_lossy()))
        .output()
        .map_err(|e| format!("Failed to run init: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        // Often mysql_install_db prints help to stdout on error, check both
        let out = String::from_utf8_lossy(&output.stdout);
        return Err(format!("MariaDB Init Failed: {} {}", err, out));
    }

    Ok("MariaDB Initialized Successfully".to_string())
}

#[tauri::command]
pub fn change_mariadb_password(bin_path: String, old_pass: String, new_pass: String) -> Result<String, String> {
    let bin_dir = PathBuf::from(&bin_path);
    let mysqladmin = if cfg!(target_os = "windows") {
        bin_dir.join("mysqladmin.exe")
    } else {
        bin_dir.join("mysqladmin")
    };

    if !mysqladmin.exists() {
        return Err(format!("mysqladmin not found at {:?}", mysqladmin));
    }

    let mut args = vec![
        "-u".to_string(),
        "root".to_string(),
    ];

    if !old_pass.is_empty() {
        args.push(format!("-p{}", old_pass));
    }

    args.push("password".to_string());
    args.push(new_pass);

    let mut command = Command::new(mysqladmin);
    command.args(&args);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().map_err(|e| format!("Failed to run mysqladmin: {}", e))?;

    if output.status.success() {
        Ok("Password updated successfully".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("Access denied") {
            return Err("Access denied. Current password incorrect.".to_string());
        }
        Err(format!("Error: {}", err))
    }
}
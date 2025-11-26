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

#[tauri::command]
pub fn init_mysql(version_folder: String) -> Result<String, String> {
    let home = get_home().ok_or("Home not found")?;
    let base = home.join(".stackmanager");
    let data_dir = base.join("data").join("mysql");
    
    if data_dir.exists() {
        return Ok("MariaDB already initialized".to_string());
    }

    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    
    let source_data = base.join("services").join(&version_folder).join("data");
    if source_data.exists() {
        let _ = copy_dir_all(&source_data, &data_dir);
    }

    Ok("MariaDB Data Directory Initialized".to_string())
}

fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
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
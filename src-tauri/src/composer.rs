use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::env;
use std::fs;
use reqwest::Client;
use futures_util::StreamExt;
use std::io::{BufRead, BufReader, Write};
use tauri::{AppHandle, Emitter};

// Helper to get paths
fn get_paths() -> Option<(PathBuf, PathBuf)> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    let bin_dir = home.join(".stackmanager").join("bin");
    let services_dir = home.join(".stackmanager").join("services");

    Some((bin_dir, services_dir))
}

fn ensure_php_extensions(php_dir: &PathBuf) -> Result<(), String> {
    let ini_path = php_dir.join("php.ini");
    let dev_ini = php_dir.join("php.ini-development");
    
    if !ini_path.exists() {
        if dev_ini.exists() {
            fs::copy(&dev_ini, &ini_path).map_err(|e| e.to_string())?;
        } else {
            return Err("Could not find php.ini-development template".to_string());
        }
    }

    let content = fs::read_to_string(&ini_path).map_err(|e| e.to_string())?;
    let mut new_lines = Vec::new();
    let mut modified = false;

    for line in content.lines() {
        let trimmed = line.trim();
        
        // 1. Enable Extension Dir
        if trimmed.contains(";extension_dir = \"ext\"") {
             new_lines.push("extension_dir = \"ext\"".to_string());
             modified = true;
             continue;
        }

        // 2. Enable Extensions (Smarter Check)
        if trimmed.starts_with(";") && (
           trimmed.contains("extension=openssl") || 
           trimmed.contains("extension=mbstring") || 
           trimmed.contains("extension=curl") || 
           trimmed.contains("extension=fileinfo") || 
           trimmed.contains("extension=pdo_mysql") || 
           trimmed.contains("extension=mysqli") ||
           trimmed.contains("extension=zip") 
        ) {
            // Remove the first char (semicolon)
            new_lines.push(trimmed[1..].to_string());
            modified = true;
            continue;
        }

        new_lines.push(line.to_string());
    }

    if modified {
        fs::write(&ini_path, new_lines.join("\n")).map_err(|e| e.to_string())?;
        println!("PHP.ini updated with required extensions.");
    }

    Ok(())
}

#[tauri::command]
pub async fn init_composer() -> Result<String, String> {
    let (bin_dir, _) = get_paths().ok_or("Home dir not found")?;
    let composer_path = bin_dir.join("composer.phar");
    
    let php_dir = bin_dir.join("php");
    if php_dir.exists() {
        ensure_php_extensions(&php_dir)?;
    }

    if composer_path.exists() {
        return Ok("Composer ready.".to_string());
    }

    // Download logic...
    let url = "https://getcomposer.org/download/latest-stable/composer.phar";
    let client = Client::new();
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to download Composer: {}", res.status()));
    }

    let mut stream = res.bytes_stream();
    let mut file = fs::File::create(&composer_path).map_err(|e| e.to_string())?;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok("Composer downloaded successfully!".to_string())
}

#[tauri::command]
pub async fn create_laravel_project(
    app: AppHandle, 
    project_name: String, 
    parent_folder: String
) -> Result<String, String> {
    let (bin_dir, _) = get_paths().ok_or("Home dir not found")?;
    let composer_phar = bin_dir.join("composer.phar");
    let php_exe = bin_dir.join("php").join("php.exe");

    ensure_php_extensions(&bin_dir.join("php"))?;

    if !composer_phar.exists() { return Err("Composer missing".to_string()); }

    // Prepare Command
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(&["/C", &php_exe.to_string_lossy(), &composer_phar.to_string_lossy(), "create-project", "laravel/laravel", &project_name, "--prefer-dist"]);
        c
    } else {
        let mut c = Command::new(&php_exe);
        c.args(&[&composer_phar.to_string_lossy(), "create-project", "laravel/laravel", &project_name, "--prefer-dist"]);
        c
    };

    cmd.current_dir(&parent_folder)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    // Spawn (This is non-blocking for the OS)
    let mut child = cmd.spawn().map_err(|e| format!("Failed to start composer: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Thread for STDOUT
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_handle.emit("composer-progress", l); 
            }
        }
    });

    // Thread for STDERR (Composer uses this for progress bars)
    let app_handle_err = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_handle_err.emit("composer-progress", l);
            }
        }
    });

    // Wait for finish (Since function is async, Tauri runs this off main thread)
    let status = tauri::async_runtime::spawn_blocking(move || {
        child.wait()
    }).await.map_err(|e| e.to_string())?
      .map_err(|e| e.to_string())?;

    if status.success() {
        let path = std::path::Path::new(&parent_folder).join(&project_name);
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("Composer exited with error code.".to_string())
    }
}
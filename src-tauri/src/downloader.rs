use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::env;
use futures_util::StreamExt;
use reqwest::Client;
use zip::ZipArchive;

fn get_stackmanager_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    Some(home.join(".stackmanager"))
}

#[tauri::command]
pub async fn download_service(name: String, url: String) -> Result<String, String> {
    let root = get_stackmanager_root().ok_or("Could not find home directory")?;
    let target_path = root.join("services");
    
    if !target_path.exists() { fs::create_dir_all(&target_path).map_err(|e| e.to_string())?; }

    let service_folder = target_path.join(&name);
    let zip_path = target_path.join(format!("{}.zip", name));

    let client = Client::builder().user_agent("StackManager/1.0").build().map_err(|e| e.to_string())?;

    println!("Downloading Service: {}", url);
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() { return Err(format!("Failed to connect: {}", res.status())); }

    {
        let mut stream = res.bytes_stream();
        let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;
        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }
    }

    println!("Unzipping to: {:?}", service_folder);
    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&service_folder).map_err(|e| e.to_string())?;
    fs::remove_file(zip_path).map_err(|e| e.to_string())?;

    Ok(format!("Downloaded {}", name))
}

// --- UPDATED COMMAND ---
#[tauri::command]
pub async fn install_adminer_file(file_name: String, url: String) -> Result<String, String> {
    let root = get_stackmanager_root().ok_or("Could not find home directory")?;
    
    // SAVE TO SPECIFIC ADMINER FOLDER
    let target_dir = root.join("adminer");
    
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    let target_file = target_dir.join(&file_name);

    let client = Client::builder().user_agent("StackManager/1.0").build().map_err(|e| e.to_string())?;

    println!("Downloading Adminer File: {}", url);
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() { return Err(format!("Failed: {}", res.status())); }

    let mut stream = res.bytes_stream();
    let mut file = File::create(&target_file).map_err(|e| e.to_string())?;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok(format!("Saved to {:?}", target_file))
}
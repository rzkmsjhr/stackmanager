use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::env;
use futures_util::StreamExt;
use reqwest::Client;
use zip::ZipArchive;

fn get_services_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    #[cfg(not(target_os = "windows"))]
    let home = env::var("HOME").ok().map(PathBuf::from)?;

    Some(home.join(".stackmanager").join("services"))
}

#[tauri::command]
pub async fn download_service(name: String, url: String) -> Result<String, String> {
    let target_path = get_services_path().ok_or("Could not find home directory")?;
    
    if !target_path.exists() {
        fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;
    }

    let service_folder = target_path.join(&name);
    let zip_path = target_path.join(format!("{}.zip", name));

    // 1. Create Client with User Agent (Some servers block requests without it)
    let client = Client::builder()
        .user_agent("StackManager/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    println!("Downloading from: {}", url);
    
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to connect: Server returned {}", res.status()));
    }

    // --- SCOPE START: Write the file ---
    {
        let mut stream = res.bytes_stream();
        let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;

        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        // 'file' is dropped here, ensuring data is FLUSHED to disk.
    }
    // --- SCOPE END ---

    println!("Unzipping to: {:?}", service_folder);

    // 2. Unzip
    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Extract
    archive.extract(&service_folder).map_err(|e| e.to_string())?;

    // 3. Cleanup
    fs::remove_file(zip_path).map_err(|e| e.to_string())?;

    Ok(format!("Downloaded and installed {} successfully", name))
}
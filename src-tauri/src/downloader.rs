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

#[tauri::command]
pub async fn install_adminer_file(file_name: String, url: String) -> Result<String, String> {
    let root = get_stackmanager_root().ok_or("Could not find home directory")?;
    
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

#[tauri::command]
pub async fn download_postgresql() -> Result<String, String> {
    let root = get_stackmanager_root().ok_or("Could not find home directory")?;
    let target_path = root.join("services");
    if !target_path.exists() { fs::create_dir_all(&target_path).map_err(|e| e.to_string())?; }

    let folder_name = "postgresql-16.2";
    let url = "https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64-binaries.zip";
    
    let service_folder = target_path.join(folder_name);
    let zip_path = target_path.join(format!("{}.zip", folder_name));

    if service_folder.exists() {
        return Ok("PostgreSQL already installed".to_string());
    }

    let client = Client::builder().user_agent("StackManager/1.0").build().map_err(|e| e.to_string())?;
    
    println!("Downloading PostgreSQL: {}", url);
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err(format!("Failed to connect: {}", res.status())); }

    let mut stream = res.bytes_stream();
    let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    println!("Unzipping PostgreSQL...");
    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&service_folder).map_err(|e| e.to_string())?;
    
    fs::remove_file(zip_path).map_err(|e| e.to_string())?;

    Ok(folder_name.to_string())
}

#[tauri::command]
pub async fn download_php_robust(version: String) -> Result<String, String> {
    let root = get_stackmanager_root().ok_or("Could not find home directory")?;
    let target_path = root.join("services");
    let client = Client::builder().user_agent("StackManager/1.0").build().map_err(|e| e.to_string())?;

    let parts: Vec<&str> = version.split('.').collect();
    let major: i32 = parts[0].parse().unwrap_or(8);
    let minor: i32 = parts[1].parse().unwrap_or(0);

    let compiler = if major >= 8 && minor >= 4 { "vs17" } 
                   else if major >= 8 { "vs16" }
                   else if major == 7 && minor >= 2 { "vc15" } 
                   else { "vc15" }; 

    let filename = format!("php-{}-Win32-{}-x64", version, compiler);
    let zip_name = format!("{}.zip", filename);
    
    let candidates = vec![
        format!("https://windows.php.net/downloads/releases/{}", zip_name),
        format!("https://windows.php.net/downloads/releases/archives/{}", zip_name),
        format!("https://windows.php.net/downloads/releases/php-{}-Win32-vs16-x64.zip", version), 
        format!("https://windows.php.net/downloads/releases/archives/php-{}-Win32-vs16-x64.zip", version),
    ];

    let mut valid_url = None;

    for url in candidates {
        println!("Probing: {}", url);
        let resp = client.head(&url).send().await;
        if let Ok(r) = resp {
            if r.status().is_success() {
                valid_url = Some(url);
                break;
            }
        }
    }

    let download_url = valid_url.ok_or(format!("Could not find a download for PHP {}. Try a different version.", version))?;

    let service_folder = target_path.join(&filename);
    let zip_path = target_path.join(&zip_name);

    println!("Downloading from: {}", download_url);
    let res = client.get(download_url).send().await.map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(&service_folder).map_err(|e| e.to_string())?;
    fs::remove_file(zip_path).map_err(|e| e.to_string())?;

    Ok(filename)
}
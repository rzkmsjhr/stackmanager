use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

#[cfg(target_os = "windows")]
fn get_hosts_path() -> PathBuf {
    PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts")
}

#[cfg(not(target_os = "windows"))]
fn get_hosts_path() -> PathBuf {
    PathBuf::from("/etc/hosts")
}

#[tauri::command]
pub fn add_host_entry(domain: String) -> Result<String, String> {
    let hosts_path = get_hosts_path();
    
    // 1. Read existing content
    let mut content = String::new();
    let mut file = OpenOptions::new().read(true).open(&hosts_path)
        .map_err(|e| format!("Permission Denied: Run App as Admin. ({})", e))?;
    file.read_to_string(&mut content).map_err(|e| e.to_string())?;

    // 2. Check if already exists
    let entry = format!("127.0.0.1 {}", domain);
    if content.contains(&entry) {
        return Ok("Entry already exists".to_string());
    }

    // 3. Append
    let mut file = OpenOptions::new().append(true).open(&hosts_path)
        .map_err(|e| format!("Failed to write hosts file: {}", e))?;
    
    writeln!(file, "\n{}", entry).map_err(|e| e.to_string())?;

    Ok(format!("Added {} to hosts file", domain))
}

#[tauri::command]
pub fn remove_host_entry(domain: String) -> Result<String, String> {
    let hosts_path = get_hosts_path();
    let content = fs::read_to_string(&hosts_path).map_err(|e| e.to_string())?;
    
    let entry = format!("127.0.0.1 {}", domain);
    
    let new_content: String = content.lines()
        .filter(|line| !line.contains(&entry))
        .collect::<Vec<&str>>()
        .join("\n");

    fs::write(&hosts_path, new_content).map_err(|e| format!("Write failed: {}", e))?;
    
    Ok(format!("Removed {} from hosts", domain))
}
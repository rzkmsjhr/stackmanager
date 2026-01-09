use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

fn get_hosts_path() -> PathBuf {
    PathBuf::from("C:\\Windows\\System32\\drivers\\etc\\hosts")
}

#[tauri::command]
pub fn add_host_entry(domain: String) -> Result<String, String> {
    let hosts_path = get_hosts_path();
    let ip = "127.0.0.1";
    let entry = format!("\n{} {}\n", ip, domain);

    if let Ok(mut file) = OpenOptions::new().append(true).open(&hosts_path) {
        if file.write_all(entry.as_bytes()).is_ok() {
            return Ok(format!("Mapped {} to {}", domain, ip));
        }
    }

    let ps_command = format!(
        "Add-Content -Path '{}' -Value '{}' -Force", 
        hosts_path.to_string_lossy(), 
        entry.trim()
    );

    run_elevated_powershell(&ps_command)
}

#[tauri::command]
pub fn remove_host_entry(domain: String) -> Result<String, String> {
    let hosts_path = get_hosts_path();
    
    let can_write = OpenOptions::new().write(true).open(&hosts_path).is_ok();

    if can_write {
        let content = fs::read_to_string(&hosts_path).map_err(|e| e.to_string())?;
        let new_content = content
            .lines()
            .filter(|line| !line.contains(&domain))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&hosts_path, new_content).map_err(|e| e.to_string())?;
        return Ok(format!("Removed {}", domain));
    }

    let ps_command = format!(
        "(Get-Content '{}') | Where-Object {{ $_ -notmatch '{}' }} | Set-Content '{}' -Force",
        hosts_path.to_string_lossy(),
        domain,
        hosts_path.to_string_lossy()
    );

    run_elevated_powershell(&ps_command)
}

fn run_elevated_powershell(command: &str) -> Result<String, String> {
    println!("Requesting Elevation for: {}", command);
    
    let output = Command::new("powershell")
        .args(&[
            "Start-Process",
            "powershell",
            "-Verb", "RunAs",
            "-WindowStyle", "Hidden",
            "-Wait",
            "-ArgumentList", &format!("\"-Command {}\"", command.replace("\"", "`\""))
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("Operation completed via Admin prompt".to_string())
    } else {
        Err("Failed to elevate privileges".to_string())
    }
}
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use std::path::Path;
use std::env;
use std::net::{TcpStream, SocketAddr};
use std::time::{Duration, Instant};
use std::thread;
use tauri::State;

pub struct ServiceState {
    pub pids: Mutex<HashMap<String, u32>>,
}

impl ServiceState {
    pub fn new() -> Self {
        Self {
            pids: Mutex::new(HashMap::new()),
        }
    }
}

fn is_port_open(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(100)).is_ok()
}

#[tauri::command]
pub async fn start_service(
    state: State<'_, ServiceState>,
    id: String,
    bin_path: String,
    args: Vec<String>,
    cwd: Option<String>,
    env_paths: Option<Vec<String>>,
    port: Option<u16>,
) -> Result<String, String> {
    
    {
        let pids = state.pids.lock().map_err(|_| "Failed to lock state")?;
        if pids.contains_key(&id) {
            return Err(format!("Service '{}' is already running.", id));
        }
    }

    if let Some(p) = port {
        if is_port_open(p) {
            return Err(format!("Port {} is already in use by another application.", p));
        }
    }

    let mut command = Command::new(&bin_path);
    command.args(&args);

    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    let current_path = env::var("PATH").unwrap_or_default();
    let mut new_path_parts = Vec::new();
    if let Some(paths) = env_paths {
        for p in paths { new_path_parts.push(p); }
    }
    if let Some(parent_dir) = Path::new(&bin_path).parent() {
        new_path_parts.push(parent_dir.to_string_lossy().to_string());
    }
    new_path_parts.push(current_path);
    let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    let new_path = new_path_parts.join(separator);
    command.env("PATH", new_path);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn()
        .map_err(|e| format!("Failed to start {}: {}", bin_path, e))?;

    let pid = child.id();
    let start_time = Instant::now();
    let timeout = Duration::from_secs(60); 

    if let Some(target_port) = port {
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!("Process exited prematurely with code: {}", status));
                }
                Ok(None) => {
                }
                Err(e) => {
                    return Err(format!("Error attempting to wait on child: {}", e));
                }
            }

            if is_port_open(target_port) {
                break;
            }

            if start_time.elapsed() > timeout {
                let _ = child.kill(); 
                return Err(format!("Service timed out after 60s. It started (PID: {}) but failed to open port {}.", pid, target_port));
            }

            thread::sleep(Duration::from_millis(500));
        }
    }

    let mut pids = state.pids.lock().map_err(|_| "Failed to lock state")?;
    pids.insert(id.clone(), pid);
    
    println!("Started service: {} (PID: {})", id, pid);
    Ok(format!("Started {} (PID: {})", id, pid))
}

#[tauri::command]
pub fn stop_service(state: State<ServiceState>, id: String) -> Result<String, String> {
    let mut pids = state.pids.lock().map_err(|_| "Failed to lock state")?;

    if let Some(pid) = pids.remove(&id) {
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()]) 
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
        Ok(format!("Stopped service {}", id))
    } else {
        Err(format!("Service {} not found or not running", id))
    }
}
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
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

#[tauri::command]
pub fn start_service(
    state: State<ServiceState>,
    id: String,
    bin_path: String,
    args: Vec<String>,
    cwd: Option<String>, // <-- Added cwd parameter
) -> Result<String, String> {
    let mut pids = state.pids.lock().map_err(|_| "Failed to lock state")?;
    
    if pids.contains_key(&id) {
        return Err(format!("Service '{}' is already running.", id));
    }

    let mut command = Command::new(&bin_path);
    command.args(&args);

    // Set working directory if provided
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    
    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn()
        .map_err(|e| format!("Failed to start {}: {}", bin_path, e))?;

    let pid = child.id();
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
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .arg(pid.to_string())
                .output();
        }

        println!("Stopped service: {}", id);
        Ok(format!("Stopped service {}", id))
    } else {
        Err(format!("Service {} not found or not running", id))
    }
}
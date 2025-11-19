use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

// Shared state to hold the PIDs (Process IDs) of running services.
// Key = service_id (e.g., "project-1-php"), Value = OS PID
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
) -> Result<String, String> {
    // 1. Lock the state to check running services
    let mut pids = state.pids.lock().map_err(|_| "Failed to lock state")?;
    
    if pids.contains_key(&id) {
        return Err(format!("Service '{}' is already running.", id));
    }

    // 2. Spawn the process
    // Note: In the future, we will capture stdout/stderr here for logs.
    let child = Command::new(&bin_path)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to start {}: {}", bin_path, e))?;

    let pid = child.id();
    
    // 3. Store the PID
    pids.insert(id.clone(), pid);
    
    println!("Started service: {} with PID: {}", id, pid);
    Ok(format!("Started {} (PID: {})", id, pid))
}

#[tauri::command]
pub fn stop_service(state: State<ServiceState>, id: String) -> Result<String, String> {
    let mut pids = state.pids.lock().map_err(|_| "Failed to lock state")?;

    if let Some(pid) = pids.remove(&id) {
        // 4. Kill the process based on OS
        #[cfg(target_os = "windows")]
        {
            // On Windows, "taskkill /F /PID" is reliable for external binaries
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            // On Mac/Linux, use standard kill
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
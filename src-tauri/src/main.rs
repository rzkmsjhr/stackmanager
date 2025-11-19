#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// 1. Import the module we just created
mod process_manager;

use process_manager::{start_service, stop_service, ServiceState};

fn main() {
    tauri::Builder::default()
        // 2. Initialize the shared state
        .manage(ServiceState::new())
        // 3. Register the commands so Frontend can call them
        .invoke_handler(tauri::generate_handler![
            start_service, 
            stop_service
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
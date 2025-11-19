#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod process_manager;
mod filesystem;

use process_manager::{start_service, stop_service, ServiceState};
use filesystem::{init_environment, get_services};

fn main() {
    tauri::Builder::default()
        .manage(ServiceState::new())
        .invoke_handler(tauri::generate_handler![
            start_service, 
            stop_service,
            init_environment,
            get_services 
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod process_manager;
mod filesystem;
mod downloader;
mod shim;
mod store;

use process_manager::{start_service, stop_service, ServiceState};
use filesystem::{init_environment, get_services};
use downloader::download_service;
use shim::set_active_version;
use store::{save_projects, load_projects}; 

#[tauri::command]
fn open_in_browser(url: String) {
    let _ = open::that(url);
}

fn main() {
    tauri::Builder::default()
        .manage(ServiceState::new())
        .invoke_handler(tauri::generate_handler![
            start_service, 
            stop_service,
            init_environment,
            get_services,
            download_service,
            set_active_version,
            open_in_browser,
            save_projects,
            load_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
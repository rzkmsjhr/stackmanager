#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod process_manager;
mod filesystem;
mod downloader;
mod shim;
mod store;
mod database;
mod composer;
mod terminal; // <-- New

use process_manager::{start_service, stop_service, ServiceState};
use filesystem::{init_environment, get_services, get_service_bin_path, get_user_home, delete_service_folder};
use downloader::download_service;
use shim::{set_active_version, get_active_version}; // <-- Update
use store::{save_projects, load_projects};
use database::init_mysql;
use composer::{init_composer, create_laravel_project};
use terminal::open_project_terminal; // <-- New

#[tauri::command]
fn open_in_browser(url: String) {
    let _ = open::that(url);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ServiceState::new())
        .invoke_handler(tauri::generate_handler![
            start_service, 
            stop_service,
            init_environment,
            get_services,
            get_service_bin_path,
            get_user_home,
            delete_service_folder,
            download_service,
            set_active_version,
            get_active_version, // <-- Registered
            open_in_browser,
            save_projects,
            load_projects,
            init_mysql,
            init_composer,
            create_laravel_project,
            open_project_terminal // <-- Registered
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
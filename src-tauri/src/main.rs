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
mod terminal;
mod hosts; 
mod proxy;

use std::sync::Arc;
use tauri::Manager;

use process_manager::{start_service, stop_service, ServiceState};
use filesystem::{
    init_environment, get_services, get_service_bin_path, get_user_home, 
    delete_service_folder, delete_project_dir, check_projects_status, 
    detect_framework, prepare_php_ini
};
use downloader::download_service;
use shim::{set_active_version, get_active_version};
use store::{save_projects, load_projects};
use database::init_mysql;
use composer::{init_composer, create_laravel_project};
use terminal::open_project_terminal;
use hosts::{add_host_entry, remove_host_entry};
use proxy::{start_proxy_server, register_proxy_route, ProxyState};

#[tauri::command]
fn open_in_browser(url: String) {
    let _ = open::that(url);
}

fn main() {
    let proxy_state = Arc::new(ProxyState::new());
    let proxy_state_clone = proxy_state.clone();
    let service_state = ServiceState::new();

    tauri::async_runtime::spawn(async move {
        start_proxy_server(proxy_state_clone).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(service_state)
        .manage(proxy_state)
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
            get_active_version,
            open_in_browser,
            save_projects,
            load_projects,
            init_mysql,
            init_composer,
            create_laravel_project,
            open_project_terminal,
            delete_project_dir,
            check_projects_status,
            detect_framework,
            prepare_php_ini,
            add_host_entry,
            remove_host_entry,
            register_proxy_route
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } => {
                    let state = app_handle.state::<ServiceState>();
                    let mut pids = state.pids.lock().unwrap();
                    for (id, pid) in pids.iter() {
                        println!("Killing service {} (PID: {}) on exit", id, pid);
                        #[cfg(target_os = "windows")]
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .output();
                    }
                }
                _ => {}
            }
        });
}
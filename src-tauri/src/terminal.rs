use std::process::Command;
use std::env;

#[tauri::command]
pub fn open_project_terminal(cwd: String, env_paths: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let current_path = env::var("PATH").unwrap_or_default();
        let mut new_path_parts = env_paths;
        new_path_parts.push(current_path);
        
        let new_path = new_path_parts.join(";");

        Command::new("cmd")
            .args(&["/C", "start", "cmd", "/K", "title StackManager Project Terminal"]) 
            .current_dir(cwd)
            .env("PATH", new_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let current_path = env::var("PATH").unwrap_or_default();
        let mut new_path_parts = env_paths;
        new_path_parts.push(current_path);
        let new_path = new_path_parts.join(":");

        if let Ok(_) = Command::new("gnome-terminal").arg("--").exists() {
             Command::new("gnome-terminal").current_dir(cwd).env("PATH", new_path).spawn().map_err(|e| e.to_string())?;
        } else {
            Command::new("xterm").current_dir(cwd).env("PATH", new_path).spawn().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
use std::process::Command;
use std::env;

#[tauri::command]
pub fn open_project_terminal(cwd: String, php_bin_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Get Current System PATH
        let current_path = env::var("PATH").unwrap_or_default();
        
        // 2. Prepend the Project's PHP Path to the environment
        // This makes 'php -v' use the version in `php_bin_path`
        let new_path = format!("{};{}", php_bin_path, current_path);

        // 3. Spawn CMD
        // /K keeps the window open.
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
        let new_path = format!("{}:{}", php_bin_path, current_path);

        if let Ok(_) = Command::new("gnome-terminal").arg("--").exists() {
             Command::new("gnome-terminal")
                .current_dir(cwd)
                .env("PATH", new_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("xterm")
                .current_dir(cwd)
                .env("PATH", new_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
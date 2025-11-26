# StackManager

**StackManager** is a modern, lightweight, and isolated local development environment built specifically for Windows. It serves as a robust alternative to XAMPP, Laragon, or Docker for PHP developers who want speed and simplicity without the configuration headaches.

![StackManager Screenshot](https://via.placeholder.com/800x450?text=StackManager+Dashboard)
*(Replace this link with an actual screenshot of your dashboard)*

## 🚀 Key Features

* **Per-Project PHP Versions:** Run a legacy project on PHP 7.4 and a modern Laravel app on PHP 8.3 simultaneously. Each project runs in an isolated process.
* **Framework Detection:** Automatically detects **Laravel**, **Symfony**, and **WordPress**, configuring the server root (`/public` vs `/`) and launch commands (`artisan serve`) automatically.
* **Custom Domains (.test):** Built-in Rust Reverse Proxy allows you to map projects to `project-name.test` instead of `localhost:8000`.
* **Isolated Environment:** Does not pollute your Windows System PATH. All binaries (PHP, MariaDB, Composer) are managed internally in `~/.stackmanager`.
* **Integrated Database:**
    * Embedded **MariaDB** server.
    * **Adminer** included for database management (with Theme support!).
    * One-click password configuration.
* **Smart Configuration:** Automatically patches `php.ini` to enable required extensions (Intl, Mbstring, OpenSSL, PDO) and sets memory/upload limits for modern development.

## 🛠️ Tech Stack

* **Frontend:** React, TypeScript, TailwindCSS, Lucide Icons.
* **Backend:** Rust (Tauri v2).
* **Services:** PHP (Win32 VS16/VS17), MariaDB, Adminer.

## 📦 Installation

1.  Download the latest `StackManager_x64-setup.exe` from the releases.
2.  Run the installer.
3.  **Important:** Right-click and **Run as Administrator**.
    * *Why?* Administrator privileges are required to modify the Windows `hosts` file for custom domains (e.g., `blog.test`).

## 🚦 Usage Guide

### 1. Initial Setup
* On first launch, the app will initialize the `.stackmanager` folder in your User directory.
* Go to **Tools** in the sidebar to download **PHP** and **MariaDB**.

### 2. Managing PHP
* Open the **PHP Version Manager** (Gear icon).
* Download the versions you need (e.g., 8.2, 7.4).
* Set a "Global Default" for the CLI and generic projects.

### 3. Adding a Project
* Click **Import Project**.
* Select your project folder.
* StackManager will auto-detect the framework.
* Click the **Info (i)** icon to set a specific PHP version or Custom Domain for that project.

### 4. Database
* Click the **Play** button next to MariaDB.
* Click **Get Adminer** (or the Open button) to manage your database.
* **Default Credentials:**
    * **Host:** `127.0.0.1`
    * **User:** `root`
    * **Pass:** (Empty by default, can be changed via the Gear icon).

## 💻 Development

If you want to contribute or build from source:

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Rust & Cargo](https://rustup.rs/)
* [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### Build Commands

```bash
# Install dependencies
npm install

# Run in Development Mode (Hot Reload)
npm run tauri dev

# Build for Production (.exe installer)
npm run tauri build
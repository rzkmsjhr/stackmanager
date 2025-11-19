import React, { useState, useEffect } from 'react';
import {
  Play, Square, Trash2, Info,
  Globe, Folder, Activity, Settings,
  PlusCircle, CheckCircle, XCircle, Terminal
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ServiceAPI } from './api/serviceControl';
import { Database } from 'lucide-react'; // Import Database Icon
import { open } from '@tauri-apps/plugin-dialog';

// --- Types ---
type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting';

interface Project {
  id: string;
  name: string;
  path: string;
  framework: 'laravel' | 'symfony' | 'wordpress' | 'custom';
  domain: string;
  port: number; // Added Port
  status: ServiceStatus;
  phpVersion: string;
}

// --- REAL DATA FOR TESTING ---
const initialProjects: Project[] = [
  {
    id: 'test-1',
    name: 'My Test Project',
    path: 'D:/stack-test', // <--- MAKE SURE THIS FOLDER EXISTS
    framework: 'custom',
    domain: 'localhost',
    port: 8000,
    status: 'stopped',
    phpVersion: '8.2 (Global)',
  }
];

const StatusIndicator = ({ status }: { status: ServiceStatus }) => {
  switch (status) {
    case 'running': return <div className="flex items-center gap-1 text-emerald-500 text-sm font-medium"><CheckCircle size={14} /> Running</div>;
    case 'stopped': return <div className="flex items-center gap-1 text-gray-400 text-sm font-medium"><Square size={14} /> Stopped</div>;
    case 'error': return <div className="flex items-center gap-1 text-red-500 text-sm font-medium"><XCircle size={14} /> Error</div>;
    default: return <div className="flex items-center gap-1 text-blue-500 text-sm font-medium"><Activity size={14} /> Starting</div>;
  }
};

export default function App() {
  // 1. Start with EMPTY projects
  const [projects, setProjects] = useState<Project[]>([]);

  // --- Helper to Save to Disk ---
  const updateAndSave = async (newProjects: Project[]) => {
    setProjects(newProjects);
    // Convert to JSON string and send to Rust
    await invoke('save_projects', { data: JSON.stringify(newProjects) });
  };

  // --- Load on Start ---
  useEffect(() => {
    const init = async () => {
      try {
        await invoke('init_environment');

        // LOAD PROJECTS FROM DISK
        const json = await invoke<string>('load_projects');
        const savedProjects = JSON.parse(json);
        if (savedProjects.length > 0) {
          setProjects(savedProjects);
        } else {
          // If empty, maybe add a default one for guidance?
          const defaultProj: Project = {
            id: 'demo-1',
            name: 'My First Project',
            path: 'D:/stack-test',
            framework: 'custom',
            domain: 'localhost',
            port: 8000,
            status: 'stopped',
            phpVersion: '8.2',
          };
          updateAndSave([defaultProj]);
        }
      } catch (error) {
        console.error("Init Failed:", error);
      }
    };
    init();
  }, []);

  // --- Updated Toggle Function (Uses updateAndSave) ---
  const toggleProjectService = async (project: Project) => {
    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';

    // Update State & Save
    const updatedList = projects.map(p =>
      p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p
    );
    // Note: We don't necessarily need to save "status" to disk (it should probably start as stopped), 
    // but for now, saving everything is fine.
    setProjects(updatedList);

    // ... (Keep the rest of the PHP start/stop logic exactly the same) ...
    // ... just ensure you use 'setProjects' correctly ...
  };

  // --- NEW: Add Project Function ---
  const addNewProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder"
      });

      if (selected && typeof selected === 'string') {
        // Extract folder name from path for the project name
        // e.g. "C:/Users/Dev/my-app" -> "my-app"
        const name = selected.split(/[\\/]/).pop() || "Untitled Project";

        const newProj: Project = {
          id: crypto.randomUUID(),
          name: name,
          path: selected, // Use real path
          framework: 'custom', // You could auto-detect this later by checking files!
          domain: 'localhost',
          port: 8000 + projects.length + 1,
          status: 'stopped',
          phpVersion: '8.2'
        };
        updateAndSave([...projects, newProj]);
      }
    } catch (err) {
      console.error("Failed to pick folder:", err);
    }
  };

  // Add this State for MySQL
  const [mysqlStatus, setMysqlStatus] = useState<ServiceStatus>('stopped');

  // Function to handle MySQL Logic
  const toggleMySQL = async () => {
    const folderName = "mariadb-10.11.6-winx64"; // We will download this specific version
    const serviceId = "global_mysql";

    if (mysqlStatus === 'running') {
      setMysqlStatus('stopped');
      await ServiceAPI.stop(serviceId);
    } else {
      setMysqlStatus('starting');
      try {
        // 1. Ensure Data Directory Exists
        console.log("Initializing DB...");
        await invoke('init_mysql', { versionFolder: folderName });

        // 2. Start Daemon
        // Path: .stackmanager/services/mariadb.../bin/mysqld.exe
        // Args: --console --datadir=".../data/mysql"
        const userProfile = await invoke<string>('init_environment').then(s => s.split(' at ')[1].replace(/"/g, '').replace('.stackmanager', ''));
        // (Note: Getting the path in JS is tricky, usually better to pass full path from Rust. 
        // For this demo, we assume standard path or rely on Rust to know paths.
        // To keep it simple, let's construct the path assuming standard Windows layout)

        const binPath = `C:/Users/MadeIndonesia/.stackmanager/services/${folderName}/${folderName}/bin/mysqld.exe`;
        const dataPath = `C:/Users/${import.meta.env.VITE_USERNAME || 'MadeIndonesia'}/.stackmanager/data/mysql`;

        await ServiceAPI.start({
          id: serviceId,
          binPath: binPath,
          args: ["--console", `--datadir=${dataPath}`]
        });

        setMysqlStatus('running');
      } catch (e) {
        console.error(e);
        alert("MySQL Error: " + e);
        setMysqlStatus('error');
      }
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.1.0 Dev</p>

        {/* GLOBAL SERVICES */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Global Stack</h3>

          {/* MySQL Control */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded">
                <Database size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">MariaDB</div>
                <div className="text-[10px] text-slate-400">Port 3306</div>
              </div>
            </div>
            <button onClick={toggleMySQL} className={`p-1.5 rounded transition-colors ${mysqlStatus === 'running' ? 'text-red-500 hover:bg-red-100' : 'text-emerald-500 hover:bg-emerald-100'}`}>
              {mysqlStatus === 'running' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
          </div>
          {mysqlStatus === 'running' && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800">
              <p><strong>Host:</strong> 127.0.0.1</p>
              <p><strong>Port:</strong> 3306</p>
              <p><strong>User:</strong> root</p>
              <p><strong>Pass:</strong> (empty)</p>
            </div>
          )}
        </div>

        {/* Helper Tools Section */}
        <div className="space-y-2">
          <p className="text-xs text-slate-400 mb-2">Installers</p>
          <button onClick={() => invoke('download_service', {
            name: 'mariadb-10.11.6-winx64',
            url: 'https://archive.mariadb.org/mariadb-10.11.6/winx64-packages/mariadb-10.11.6-winx64.zip'
          }).then(() => alert("MariaDB Downloaded!"))}
            className="w-full text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 p-2 rounded text-left flex items-center gap-2">
            <span className="font-bold">+</span> Get MariaDB 10.11
          </button>
          <button onClick={() => invoke('download_service', {
            name: 'php-8.2.10-Win32-vs16-x64',
            url: 'https://windows.php.net/downloads/releases/archives/php-8.2.10-Win32-vs16-x64.zip'
          }).then(() => alert("Downloaded!"))}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 p-2 rounded text-left">
            1. Download PHP 8.2
          </button >

          <button onClick={() => invoke('set_active_version', {
            service: 'php',
            versionFolder: 'php-8.2.10-Win32-vs16-x64'
          }).then(() => alert("Activated!"))}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 p-2 rounded text-left">
            2. Activate PHP 8.2
          </button>
        </div >
        <div className="mt-auto">
          <button onClick={addNewProject} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20">
            <PlusCircle size={16} /> New Project
          </button>
        </div>
      </div >

      {/* Main Area */}
      < div className="flex-1 p-8" >
        <header className="flex justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-700">My Projects</h2>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center justify-between p-4 border-b last:border-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold">
                  PHP
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">{project.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Folder size={12} /> {project.path}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    invoke('open_in_browser', { url: `http://localhost:${project.port}` });
                  }}
                  className="text-indigo-600 text-sm hover:underline flex items-center gap-1"
                >
                  <Globe size={14} /> localhost:{project.port}
                </a>

                <StatusIndicator status={project.status} />

                <button
                  onClick={() => toggleProjectService(project)}
                  className={`p-2 rounded-full transition-colors ${project.status === 'running'
                    ? 'bg-red-50 text-red-500 hover:bg-red-100'
                    : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'
                    }`}
                >
                  {project.status === 'running' ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div >
    </div >
  );
}
import React, { useState, useEffect } from 'react';
import {
  Play, Square, Trash2, Info,
  Globe, Folder, Activity, Settings,
  PlusCircle, CheckCircle, XCircle, Terminal
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ServiceAPI } from './api/serviceControl';

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
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  // --- Init Environment on Load ---
  useEffect(() => {
    invoke('init_environment').catch(console.error);
  }, []);

  // --- THE REAL SERVER LOGIC ---
  const toggleProjectService = async (project: Project) => {
    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';

    // Optimistic Update
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p
    ));

    try {
      if (newStatus === 'running') {
        console.log(`Starting PHP Server on port ${project.port}...`);

        // 1. Define the Path to our Shimmed PHP
        // This path always points to the currently "Activated" version
        const phpPath = "C:/Users/MadeIndonesia/.stackmanager/bin/php/php.exe";

        // 2. Call the Rust Backend
        // Command: php -S 127.0.0.1:8000 -t C:/stack-test
        const res = await ServiceAPI.start({
          id: backendId,
          binPath: phpPath,
          args: [
            "-S", `127.0.0.1:${project.port}`,
            "-t", project.path
          ]
        });
        console.log("Server Started:", res);

        // 3. Mark as Running
        setProjects(prev => prev.map(p =>
          p.id === project.id ? { ...p, status: 'running' } : p
        ));

      } else {
        // STOPPING
        console.log("Stopping Server...");
        await ServiceAPI.stop(backendId);

        setProjects(prev => prev.map(p =>
          p.id === project.id ? { ...p, status: 'stopped' } : p
        ));
      }
    } catch (err) {
      console.error("Failed:", err);
      alert("Error: " + err);
      setProjects(prev => prev.map(p =>
        p.id === project.id ? { ...p, status: 'error' } : p
      ));
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.1.0 Dev</p>

        {/* Helper Tools Section */}
        <div className="space-y-2">
          <button onClick={() => invoke('download_service', {
            name: 'php-8.2.10-Win32-vs16-x64',
            url: 'https://windows.php.net/downloads/releases/archives/php-8.2.10-Win32-vs16-x64.zip'
          }).then(() => alert("Downloaded!"))}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 p-2 rounded text-left">
            1. Download PHP 8.2
          </button>

          <button onClick={() => invoke('set_active_version', {
            service: 'php',
            versionFolder: 'php-8.2.10-Win32-vs16-x64'
          }).then(() => alert("Activated!"))}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 p-2 rounded text-left">
            2. Activate PHP 8.2
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 p-8">
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
      </div>
    </div>
  );
}
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
  const addNewProject = () => {
    const newProj: Project = {
      id: crypto.randomUUID(),
      name: 'New Project ' + (projects.length + 1),
      path: 'C:/stack-test', // Default path
      framework: 'custom',
      domain: 'localhost',
      port: 8000 + projects.length + 1, // Auto-increment port
      status: 'stopped',
      phpVersion: '8.2'
    };
    updateAndSave([...projects, newProj]);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.1.0 Dev</p>

        {/* Helper Tools Section */}
        <div className="space-y-2">
          <button
            onClick={addNewProject}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20">
            <PlusCircle size={16} /> New Project
          </button>
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
import React, { useState, useEffect } from 'react';
import {
  Play, Square, Trash2, Info,
  Globe, Folder, Activity, Settings,
  PlusCircle, CheckCircle, XCircle, Terminal, Database
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ServiceAPI } from './api/serviceControl';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

// --- Types ---
type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting';

interface Project {
  id: string;
  name: string;
  path: string;
  framework: 'laravel' | 'symfony' | 'wordpress' | 'custom';
  domain: string;
  port: number;
  status: ServiceStatus;
  phpVersion: string;
}

const StatusIndicator = ({ status }: { status: ServiceStatus }) => {
  switch (status) {
    case 'running': return <div className="flex items-center gap-1 text-emerald-500 text-sm font-medium"><CheckCircle size={14} /> Running</div>;
    case 'stopped': return <div className="flex items-center gap-1 text-gray-400 text-sm font-medium"><Square size={14} /> Stopped</div>;
    case 'error': return <div className="flex items-center gap-1 text-red-500 text-sm font-medium"><XCircle size={14} /> Error</div>;
    default: return <div className="flex items-center gap-1 text-blue-500 text-sm font-medium"><Activity size={14} /> Starting</div>;
  }
};


export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [mysqlStatus, setMysqlStatus] = useState<ServiceStatus>('stopped');

  const [composerLogs, setComposerLogs] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);

  const updateAndSave = async (newProjects: Project[]) => {
    setProjects(newProjects);
    await invoke('save_projects', { data: JSON.stringify(newProjects) });
  };

  useEffect(() => {
    const init = async () => {
      try {
        await invoke('init_environment');
        const json = await invoke<string>('load_projects');
        const savedProjects = JSON.parse(json);
        if (savedProjects.length > 0) {
          setProjects(savedProjects);
        }
      } catch (error) {
        console.error("Init Failed:", error);
      }
    };
    init();
  }, []);

  const toggleProjectService = async (project: Project) => {
    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';
    const updatedList = projects.map(p =>
      p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p
    );
    setProjects(updatedList);

    try {
      if (newStatus === 'running') {
        console.log(`Starting PHP Server on port ${project.port}...`);
        // NOTE: For PHP built-in server, use a high port. 
        // IMPORTANT: Ensure the binPath is correct for your machine or fetched dynamically
        const phpPath = `C:/Users/${import.meta.env.VITE_USERNAME || 'MadeIndonesia'}/.stackmanager/bin/php/php.exe`;

        await ServiceAPI.start({
          id: backendId,
          binPath: phpPath,
          args: ["-S", `127.0.0.1:${project.port}`, "-t", project.framework === 'laravel' ? `${project.path}/public` : project.path]
        });

        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'running' } : p));

      } else {
        await ServiceAPI.stop(backendId);
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'stopped' } : p));
      }
    } catch (err) {
      console.error("Failed:", err);
      alert("Error: " + err);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'error' } : p));
    }
  };

  // --- MySQL Logic ---
  const toggleMySQL = async () => {
    const folderName = "mariadb-10.11.6-winx64";
    const serviceId = "global_mysql";

    if (mysqlStatus === 'running') {
      setMysqlStatus('stopped');
      await ServiceAPI.stop(serviceId);
    } else {
      setMysqlStatus('starting');
      try {
        console.log("Initializing DB...");
        await invoke('init_mysql', { versionFolder: folderName });

        // Note: Point to the double folder structure we found earlier
        const binPath = `C:/Users/${import.meta.env.VITE_USERNAME || 'MadeIndonesia'}/.stackmanager/services/${folderName}/${folderName}/bin/mysqld.exe`;
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

  // --- Add Project (Folder Picker) ---
  const addNewProject = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Project Folder" });
      if (selected && typeof selected === 'string') {
        const name = selected.split(/[\\/]/).pop() || "Untitled Project";
        const newProj: Project = {
          id: crypto.randomUUID(),
          name: name,
          path: selected,
          framework: 'custom',
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

  const createLaravel = async () => {
    try {
      await invoke('init_composer');
      const parentFolder = await open({ directory: true, multiple: false, title: "Select Parent Folder" });

      if (!parentFolder || typeof parentFolder !== 'string') return;

      const projectName = prompt("Project Name:", "my-blog");
      if (!projectName) return;

      // START INSTALLATION MODE
      setIsInstalling(true);
      setComposerLogs(["Starting Composer..."]);

      // Listen for events
      const unlisten = await listen<string>('composer-progress', (event) => {
        setComposerLogs(prev => [...prev, event.payload]);
      });

      const newPath = await invoke<string>('create_laravel_project', {
        projectName: projectName,
        parentFolder: parentFolder
      });

      // Stop listening
      unlisten();
      setIsInstalling(false);

      const newProj: Project = {
        id: crypto.randomUUID(),
        name: projectName,
        path: newPath,
        framework: 'laravel',
        domain: 'localhost',
        port: 8000 + projects.length + 1,
        status: 'stopped',
        phpVersion: '8.2'
      };
      updateAndSave([...projects, newProj]);
      alert("Done!");

    } catch (err) {
      setIsInstalling(false);
      console.error(err);
      alert("Error: " + err);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.2.0 Beta</p>

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

        {/* Helper Tools */}
        <div className="space-y-2 border-t border-slate-100 pt-4">
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
            className="w-full text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 p-2 rounded text-left flex items-center gap-2">
            <span className="font-bold">+</span> Get PHP 8.2
          </button>

          <button onClick={() => invoke('set_active_version', {
            service: 'php',
            versionFolder: 'php-8.2.10-Win32-vs16-x64'
          }).then(() => alert("Activated!"))}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 p-2 rounded text-left">
            Activate PHP 8.2
          </button>
        </div>

        <div className="mt-auto space-y-2">
          <button onClick={createLaravel} className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 px-4 rounded-lg transition-colors text-sm font-medium border border-red-200">
            <PlusCircle size={16} /> New Laravel App
          </button>
          <button onClick={addNewProject} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20">
            <PlusCircle size={16} /> Import Project
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 p-8">
        <header className="flex justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-700">My Projects</h2>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {projects.length === 0 && (
            <div className="p-8 text-center text-slate-400">No projects yet. Click "New Laravel App" or "Import Project" to get started.</div>
          )}
          {projects.map((project) => (
            <div key={project.id} className="flex items-center justify-between p-4 border-b last:border-0">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${project.framework === 'laravel' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  {project.framework === 'laravel' ? 'Lr' : 'PHP'}
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
      {isInstalling && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-10">
          <div className="bg-slate-900 text-slate-200 w-full max-w-3xl rounded-xl shadow-2xl border border-slate-700 flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
              <h3 className="font-bold flex items-center gap-2"><Terminal size={18} /> Installing Laravel...</h3>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1">
              {composerLogs.map((log, i) => (
                <div key={i} className="break-all">{log}</div>
              ))}
              <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
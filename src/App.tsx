import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Trash2, Info, 
  Globe, Folder, Activity, Settings, 
  PlusCircle, CheckCircle, XCircle, Terminal, Database,
  Download, X, Star, Monitor, AlertTriangle, RefreshCw
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, confirm, message } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { ServiceAPI } from './api/serviceControl';

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
  const [userHome, setUserHome] = useState<string>(''); 
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [missingPaths, setMissingPaths] = useState<Record<string, boolean>>({});
  const [composerLogs, setComposerLogs] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showPhpManager, setShowPhpManager] = useState(false);
  const [installedPhp, setInstalledPhp] = useState<string[]>([]);
  const [customPhpVersion, setCustomPhpVersion] = useState(''); 
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null); 
  const [currentGlobalPhp, setCurrentGlobalPhp] = useState<string>('Loading...');

  const phpPresets = [
    { version: '8.3.2', name: 'php-8.3.2-Win32-vs16-x64', url: 'https://windows.php.net/downloads/releases/archives/php-8.3.2-Win32-vs16-x64.zip' },
    { version: '8.2.10', name: 'php-8.2.10-Win32-vs16-x64', url: 'https://windows.php.net/downloads/releases/archives/php-8.2.10-Win32-vs16-x64.zip' },
    { version: '7.4.33', name: 'php-7.4.33-Win32-vc15-x64', url: 'https://windows.php.net/downloads/releases/archives/php-7.4.33-Win32-vc15-x64.zip' },
    { version: '5.6.40', name: 'php-5.6.40-Win32-vc11-x64', url: 'https://windows.php.net/downloads/releases/archives/php-5.6.40-Win32-vc11-x64.zip' },
  ];

  const updateAndSave = async (newProjects: Project[]) => {
    setProjects(newProjects);
    await invoke('save_projects', { data: JSON.stringify(newProjects) });
    checkProjectsStatus(newProjects);
  };

  const checkProjectsStatus = async (currentProjects: Project[]) => {
      if (currentProjects.length === 0) return;
      try {
          const paths = currentProjects.map(p => p.path);
          const statusMap = await invoke<Record<string, boolean>>('check_projects_status', { paths });
          setMissingPaths(statusMap);
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const interval = setInterval(() => { checkProjectsStatus(projects); }, 3000); 
    return () => clearInterval(interval);
  }, [projects]);

  const refreshData = async () => {
      try {
          const services = await invoke<string[]>('get_services');
          const php = services.filter(s => s.startsWith('php-'));
          setInstalledPhp(php);
          const active = await invoke<string>('get_active_version', { service: 'php' });
          setCurrentGlobalPhp(active);
      } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await invoke('init_environment');
        const home = await invoke<string>('get_user_home');
        setUserHome(home);
        const json = await invoke<string>('load_projects');
        const savedProjects = JSON.parse(json);
        if (savedProjects.length > 0) {
          setProjects(savedProjects);
          checkProjectsStatus(savedProjects);
        }
        refreshData();
      } catch (error) { console.error("Init Failed:", error); }
    };
    init();
  }, []);

  const handleSetGlobalPhp = async (folderName: string) => {
      try {
          await invoke('set_active_version', { service: 'php', versionFolder: folderName });
          await message(`Global PHP version set to ${folderName}`, { title: 'Success', kind: 'info' });
          refreshData();
      } catch (e) {
          await message(`Failed: ${e}`, { title: 'Error', kind: 'error' });
      }
  };

  const handleDeleteProject = async (project: Project) => {
      const isMissing = missingPaths[project.path] === false;
      if (isMissing) {
          if (await confirm(`Remove "${project.name}"?`, { title: 'Remove', kind: 'info' })) {
              const updated = projects.filter(p => p.id !== project.id);
              updateAndSave(updated);
          }
          return;
      }
      const choice = await confirm(
          `Delete "${project.name}"?\n\nClick 'Ok' to DELETE FILES.\nClick 'Cancel' to abort.`, 
          { title: 'Delete Files?', kind: 'warning', okLabel: 'Delete Files', cancelLabel: 'Cancel' }
      );
      if (choice) {
           try {
               await invoke('delete_project_dir', { path: project.path });
               const updated = projects.filter(p => p.id !== project.id);
               updateAndSave(updated);
               await message("Project deleted.", { title: "Deleted", kind: "info" });
           } catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); }
      }
  };

  const handleReAddFolder = async (project: Project) => {
      try {
          const selected = await open({ directory: true, multiple: false, title: "Locate Project Folder" });
          if (selected && typeof selected === 'string') {
              const updatedProject = { ...project, path: selected, status: 'stopped' as ServiceStatus };
              const updatedList = projects.map(p => p.id === project.id ? updatedProject : p);
              updateAndSave(updatedList);
          }
      } catch (e) { console.error(e); }
  };

  const handleDownloadPhp = async (name: string, url: string) => {
      setDownloadingVersion(name);
      try {
          await invoke('download_service', { name, url });
          await message(`${name} downloaded!`, { title: 'Success', kind: 'info' });
          refreshData(); 
      } catch (e) { await message(`Failed: ${e}`, { title: 'Error', kind: 'error' }); } 
      finally { setDownloadingVersion(null); }
  };

  const handleCustomDownload = () => {
      if (!customPhpVersion) return;
      const parts = customPhpVersion.split('.');
      if (parts.length < 2) { alert("Invalid version"); return; }
      const major = parseInt(parts[0]); const minor = parseInt(parts[1]);
      let compiler = "vs16"; let arch = "x64";
      if (major === 5) { if (minor <= 4) { compiler = "VC9"; arch = "x86"; } else { compiler = "vc11"; } } 
      else if (major === 7) { if (minor <= 1) compiler = "vc14"; else compiler = "vc15"; }
      const folderName = `php-${customPhpVersion}-Win32-${compiler}-${arch}`;
      const url = `https://windows.php.net/downloads/releases/archives/${folderName}.zip`;
      if (confirm(`Download ${folderName}?`)) { handleDownloadPhp(folderName, url); }
  };

  const openProjectTerminal = async (project: Project) => {
      try {
          let phpPath = `${userHome}\\.stackmanager\\bin\\php`;
          if (project.phpVersion && project.phpVersion !== 'Global') {
              phpPath = await invoke<string>('get_service_bin_path', { serviceName: project.phpVersion });
          }
          await invoke('open_project_terminal', { cwd: project.path, phpBinPath: phpPath });
      } catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); }
  };

  const toggleProjectService = async (project: Project) => {
    if (missingPaths[project.path] === false) {
        await message("Project folder is missing.", { title: "Error", kind: "error" });
        return;
    }

    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';
    const updatedList = projects.map(p => p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p);
    setProjects(updatedList);

    try {
      if (newStatus === 'running') {
        let home = userHome || await invoke<string>('get_user_home');
        if (!userHome) setUserHome(home);
        
        let phpPath = `${home}\\.stackmanager\\bin\\php\\php.exe`;
        if (project.phpVersion && project.phpVersion !== 'Global') {
             try {
                 const versionBin = await invoke<string>('get_service_bin_path', { serviceName: project.phpVersion });
                 phpPath = `${versionBin}\\php.exe`;
             } catch (e) { console.warn("Using global PHP."); }
        }

        let args = [];
        // DETECT FRAMEWORK EXECUTION LOGIC
        if (project.framework === 'laravel') {
             args = ["artisan", "serve", "--host=127.0.0.1", `--port=${project.port}`];
        } else {
             // Default / Custom PHP
             const docRoot = project.framework === 'wordpress' ? project.path : (project.framework === 'symfony' ? `${project.path}/public` : project.path);
             args = ["-S", `127.0.0.1:${project.port}`, "-t", docRoot];
        }

        await ServiceAPI.start({
           id: backendId,
           binPath: phpPath,
           args: args,
           cwd: project.path // Run inside project folder
        });

        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'running' } : p));

      } else {
        await ServiceAPI.stop(backendId);
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'stopped' } : p));
      }
    } catch (err) {
      console.error(err);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'error' } : p));
    }
  };

    const toggleMySQL = async () => {
    const folderName = "mariadb-10.11.6-winx64"; 
    const serviceId = "global_mysql";
    if (mysqlStatus === 'running') {
      setMysqlStatus('stopped'); await ServiceAPI.stop(serviceId);
    } else {
      setMysqlStatus('starting');
      try {
        await invoke('init_mysql', { versionFolder: folderName });
        const binDir = await invoke<string>('get_service_bin_path', { serviceName: folderName });
        const dataPath = `${userHome || await invoke('get_user_home')}\\.stackmanager\\data\\mysql`;
        await ServiceAPI.start({ id: serviceId, binPath: `${binDir}\\mysqld.exe`, args: ["--console", `--datadir=${dataPath}`] });
        setMysqlStatus('running');
      } catch (e) { alert("MySQL Error: " + e); setMysqlStatus('error'); }
    }
  };

  const addNewProject = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Project Folder" });
      if (selected && typeof selected === 'string') {
        const name = selected.split(/[\\/]/).pop() || "Untitled Project";
        
        // Auto-Detect Framework
        const detectedFramework = await invoke<string>('detect_framework', { path: selected });
        console.log("Detected:", detectedFramework);

        const newProj: Project = {
            id: crypto.randomUUID(),
            name: name,
            path: selected,
            framework: detectedFramework as any,
            domain: 'localhost',
            port: 8000 + projects.length + 1,
            status: 'stopped',
            phpVersion: 'Global'
        };
        updateAndSave([...projects, newProj]);
      }
    } catch (err) { console.error(err); }
  };

  const createLaravel = async () => {
    try {
      await invoke('init_composer');
      const parentFolder = await open({ directory: true, multiple: false, title: "Select Folder" });
      if (!parentFolder || typeof parentFolder !== 'string') return;
      const projectName = prompt("Project Name:", "my-blog");
      if (!projectName) return;

      setIsInstalling(true);
      setComposerLogs(["Starting Composer..."]);
      const unlisten = await listen<string>('composer-progress', (event) => setComposerLogs(prev => [...prev, event.payload]));
      const newPath = await invoke<string>('create_laravel_project', { projectName, parentFolder });
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
          phpVersion: 'Global'
      };
      updateAndSave([...projects, newProj]);
      await message("Laravel Project Created!", { title: "Success", kind: "info" });
    } catch (err) {
      setIsInstalling(false);
      await message("Failed: " + err, { title: "Error", kind: "error" });
    }
  };

  const openDetails = (project: Project) => { setSelectedProject(project); setIsDetailsOpen(true); };

  const FrameworkIcon = ({ framework }: { framework: string }) => {
    switch (framework) {
      case 'laravel': return <div className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center font-bold text-xs">Lr</div>;
      case 'symfony': return <div className="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center font-bold text-xs">Sy</div>;
      case 'wordpress': return <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs">Wp</div>;
      default: return <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">PHP</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.2.0 Beta</p>
        <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Global Stack</h3>
            <div className="mb-2 flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-200 text-indigo-700 rounded"> <Monitor size={16} /> </div>
                    <div>
                        <div className="text-sm font-bold text-indigo-900">Global PHP</div>
                        <div className="text-[10px] text-indigo-500 truncate w-24" title={currentGlobalPhp}>{currentGlobalPhp}</div>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded"> <Database size={16} /> </div>
                    <div><div className="text-sm font-medium">MariaDB</div><div className="text-[10px] text-slate-400">Port 3306</div></div>
                </div>
                <button onClick={toggleMySQL} className={`p-1.5 rounded transition-colors ${mysqlStatus === 'running' ? 'text-red-500 hover:bg-red-100' : 'text-emerald-500 hover:bg-emerald-100'}`}>
                    {mysqlStatus === 'running' ? <Square size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                </button>
            </div>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 mb-2">Tools</p>
          <button onClick={() => setShowPhpManager(true)} className="w-full text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 p-2 rounded text-left flex items-center gap-2">
            <Settings size={14} /> Manage PHP Versions
          </button>
          <button onClick={() => invoke('download_service', {name: 'mariadb-10.11.6-winx64', url: 'https://archive.mariadb.org/mariadb-10.11.6/winx64-packages/mariadb-10.11.6-winx64.zip'}).then(() => message("MariaDB Downloaded!", {title:"Success", kind:"info"}))} className="w-full text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 p-2 rounded text-left flex items-center gap-2">
            <Download size={14} /> Get MariaDB
          </button>
        </div>
        <div className="mt-auto space-y-2">
             <button onClick={createLaravel} className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 px-4 rounded-lg transition-colors text-sm font-medium border border-red-200"><PlusCircle size={16} /> New Laravel App</button>
             <button onClick={addNewProject} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20"><PlusCircle size={16} /> Import Project</button>
        </div>
      </div>

      <div className="flex-1 p-8">
        <header className="flex justify-between mb-8"><h2 className="text-2xl font-bold text-slate-700">My Projects</h2></header>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {projects.length === 0 && <div className="p-8 text-center text-slate-400">No projects yet.</div>}
          {projects.map((project) => {
             const isMissing = missingPaths[project.path] === false;
             return (
                <div key={project.id} className={`relative p-4 border-b last:border-0 ${isMissing ? 'bg-red-50/50' : ''}`}>
                  {isMissing && (
                      <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-between px-6 backdrop-blur-[1px]">
                          <div className="flex items-center gap-3 text-red-600"><AlertTriangle size={20} /><div><p className="font-bold text-sm">Project Folder Missing</p><p className="text-xs text-red-400">{project.path}</p></div></div>
                          <div className="flex gap-2"><button onClick={() => handleDeleteProject(project)} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200">Remove</button><button onClick={() => handleReAddFolder(project)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 flex items-center gap-1"><RefreshCw size={12}/> Locate Folder</button></div>
                      </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4"><FrameworkIcon framework={project.framework} /><div><h3 className="font-medium text-slate-800">{project.name}</h3><div className="flex items-center gap-2 text-xs text-slate-400"><Folder size={12} /> {project.path}</div></div></div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => openProjectTerminal(project)} className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded flex items-center gap-1 hover:bg-slate-700 transition" title="Terminal"><Terminal size={12} /> Terminal</button>
                        <a href="#" onClick={(e) => { e.preventDefault(); invoke('open_in_browser', { url: `http://localhost:${project.port}` }); }} className="text-indigo-600 text-sm hover:underline flex items-center gap-1"><Globe size={14} /> localhost:{project.port}</a>
                        <StatusIndicator status={project.status} />
                        <button onClick={() => toggleProjectService(project)} className={`p-2 rounded-full transition-colors ${project.status === 'running' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'}`}>{project.status === 'running' ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                        <button onClick={() => openDetails(project)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"><Info size={18} /></button>
                        <button onClick={() => handleDeleteProject(project)} className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={18} /></button>
                    </div>
                  </div>
                </div>
             );
          })}
        </div>
      </div>

      {showPhpManager && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-10 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Settings size={20}/></div> PHP Version Manager</h3>
                <button onClick={() => setShowPhpManager(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
             </div>
             <div className="p-6 overflow-y-auto space-y-6">
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Installed Versions</h4>
                    <div className="grid grid-cols-1 gap-2">
                        {installedPhp.map(v => (
                            <div key={v} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg group">
                                <span className="font-medium text-emerald-800">{v}</span>
                                <div className="flex items-center gap-2"><button onClick={() => handleSetGlobalPhp(v)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded flex items-center gap-1"><Star size={12} /> Set Global</button><button onClick={() => handleDeletePhp(v)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"><Trash2 size={14} /></button></div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Download Custom Version</h4>
                    <div className="flex gap-2"><input type="text" placeholder="e.g. 8.1.0" className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 py-2 text-sm" value={customPhpVersion} onChange={(e) => setCustomPhpVersion(e.target.value)}/><button onClick={handleCustomDownload} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white">Download</button></div>
                </div>
             </div>
          </div>
        </div>
      )}

      {isInstalling && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-10">
            <div className="bg-slate-900 text-slate-200 w-full max-w-3xl rounded-xl shadow-2xl border border-slate-700 flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl"><h3 className="font-bold flex items-center gap-2"><Terminal size={18}/> Installing Laravel...</h3><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1">{composerLogs.map((log, i) => (<div key={i} className="break-all">{log}</div>))}<div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}></div></div>
            </div>
        </div>
      )}

      {isDetailsOpen && selectedProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start"><h3 className="text-xl font-bold text-slate-800">{selectedProject.name}</h3><button onClick={() => setIsDetailsOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button></div>
            <div className="p-6">
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">PHP Version</span>
                  <select className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-500" value={selectedProject.phpVersion} 
                    onChange={async (e) => {
                        const newVersion = e.target.value;
                        const updatedProject = { ...selectedProject, phpVersion: newVersion };
                        setSelectedProject(updatedProject);
                        const updatedList = projects.map(p => p.id === selectedProject.id ? updatedProject : p);
                        await updateAndSave(updatedList);
                    }}>
                    <option value="Global">Global (Default)</option>
                    {installedPhp.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
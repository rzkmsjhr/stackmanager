import React, { useState, useEffect } from 'react';
import { 
  Play, Square, Trash2, Info, 
  Globe, Folder, Activity, Settings, 
  PlusCircle, CheckCircle, XCircle, Terminal, Database,
  Download, X
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { ServiceAPI } from './api/serviceControl';

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
  const [userHome, setUserHome] = useState<string>(''); 
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Installation State
  const [composerLogs, setComposerLogs] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);

  // PHP Manager State
  const [showPhpManager, setShowPhpManager] = useState(false);
  const [installedPhp, setInstalledPhp] = useState<string[]>([]);
  const [customPhpVersion, setCustomPhpVersion] = useState(''); 
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null); 

  // Preset PHP Versions
  const phpPresets = [
    { version: '8.3.2', name: 'php-8.3.2-Win32-vs16-x64', url: 'https://windows.php.net/downloads/releases/archives/php-8.3.2-Win32-vs16-x64.zip' },
    { version: '8.2.10', name: 'php-8.2.10-Win32-vs16-x64', url: 'https://windows.php.net/downloads/releases/archives/php-8.2.10-Win32-vs16-x64.zip' },
    { version: '7.4.33', name: 'php-7.4.33-Win32-vc15-x64', url: 'https://windows.php.net/downloads/releases/archives/php-7.4.33-Win32-vc15-x64.zip' },
    { version: '5.6.40', name: 'php-5.6.40-Win32-vc11-x64', url: 'https://windows.php.net/downloads/releases/archives/php-5.6.40-Win32-vc11-x64.zip' },
  ];

  const updateAndSave = async (newProjects: Project[]) => {
    setProjects(newProjects);
    await invoke('save_projects', { data: JSON.stringify(newProjects) });
  };

  const fetchInstalledServices = async () => {
      try {
          const services = await invoke<string[]>('get_services');
          const php = services.filter(s => s.startsWith('php-'));
          setInstalledPhp(php);
      } catch (e) {
          console.error("Failed to fetch services", e);
      }
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
        }
        
        fetchInstalledServices();
      } catch (error) {
        console.error("Init Failed:", error);
      }
    };
    init();
  }, []);

  // --- Delete Logic ---
  const handleDeletePhp = async (folderName: string) => {
      const confirmed = await confirm(`Are you sure you want to delete ${folderName}? This cannot be undone.`, {
        title: 'Confirm Deletion',
        kind: 'warning'
      });
      if (!confirmed) {
          return;
      }
      
      try {
          await invoke('delete_service_folder', { folderName });
          fetchInstalledServices(); 
      } catch (e) {
          alert("Delete failed: " + e);
      }
  };

  const handleDownloadPhp = async (name: string, url: string) => {
      setDownloadingVersion(name);
      try {
          await invoke('download_service', { name, url });
          alert(`Successfully downloaded ${name}`);
          fetchInstalledServices(); 
      } catch (e) {
          alert("Download failed: " + e);
      } finally {
          setDownloadingVersion(null);
      }
  };

  // --- Legacy Logic ---
  const handleCustomDownload = () => {
      if (!customPhpVersion) return;
      
      const parts = customPhpVersion.split('.');
      if (parts.length < 2) {
          alert("Please enter a valid version like 8.1.0 or 5.3.29");
          return;
      }
      
      const major = parseInt(parts[0]);
      const minor = parseInt(parts[1]);

      let compiler = "vs16"; 
      let arch = "x64";

      if (major === 5) {
          if (minor <= 4) {
              compiler = "VC9"; 
              arch = "x86";
          } else {
              compiler = "vc11"; 
          }
      } else if (major === 7) {
          if (minor <= 1) compiler = "vc14"; 
          else compiler = "vc15";
      }
      
      const folderName = `php-${customPhpVersion}-Win32-${compiler}-${arch}`;
      const url = `https://windows.php.net/downloads/releases/archives/${folderName}.zip`;

      if (confirm(`Detected Legacy Configuration:\nCompiler: ${compiler}\nArch: ${arch}\n\nAttempting to download:\n${folderName}\n\nFrom:\n${url}`)) {
          handleDownloadPhp(folderName, url);
      }
  };

  const toggleProjectService = async (project: Project) => {
    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';
    
    const updatedList = projects.map(p => 
      p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p
    );
    setProjects(updatedList);

    try {
      if (newStatus === 'running') {
        let home = userHome;
        if (!home) {
             home = await invoke<string>('get_user_home');
             setUserHome(home);
        }
        
        // Default to global shim path
        let phpPath = `${home}\\.stackmanager\\bin\\php\\php.exe`;

        // Project-Specific Version Switching
        if (project.phpVersion && project.phpVersion !== 'Global' && project.phpVersion !== 'No PHP installed') {
             try {
                 const versionBin = await invoke<string>('get_service_bin_path', { 
                    serviceName: project.phpVersion 
                 });
                 phpPath = `${versionBin}\\php.exe`;
                 console.log(`Using Project-Specific PHP: ${phpPath}`);
             } catch (e) {
                 console.warn("Could not find specific version, falling back to Global.", e);
             }
        } else {
             console.log(`Using Global PHP: ${phpPath}`);
        }

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
        
        const binDir = await invoke<string>('get_service_bin_path', { 
            serviceName: folderName 
        });
        const binPath = `${binDir}\\mysqld.exe`;

        let home = userHome;
        if (!home) {
             home = await invoke<string>('get_user_home');
        }
        const dataPath = `${home}\\.stackmanager\\data\\mysql`;

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
            phpVersion: 'Global'
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
      const parentFolder = await open({ directory: true, multiple: false, title: "Select Parent Folder for New Project" });

      if (!parentFolder || typeof parentFolder !== 'string') return;

      const projectName = prompt("Enter new project name (e.g., my-blog):", "my-blog");
      if (!projectName) return;

      setIsInstalling(true);
      setComposerLogs(["Starting Composer..."]);

      const unlisten = await listen<string>('composer-progress', (event) => {
        setComposerLogs(prev => [...prev, event.payload]);
      });
      
      const newPath = await invoke<string>('create_laravel_project', {
        projectName: projectName,
        parentFolder: parentFolder
      });
      
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
      
      alert("Laravel Project Created Successfully!");

    } catch (err) {
      setIsInstalling(false);
      console.error(err);
      alert("Failed to create project: " + err);
    }
  };

  const openDetails = (project: Project) => {
    setSelectedProject(project);
    setIsDetailsOpen(true);
  };

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
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.2.0 Beta</p>
        
        <div className="mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Global Stack</h3>
            
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
                    {mysqlStatus === 'running' ? <Square size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
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

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 mb-2">Tools</p>
          
          <button onClick={() => setShowPhpManager(true)}
          className="w-full text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 p-2 rounded text-left flex items-center gap-2">
            <Settings size={14} /> Manage PHP Versions
          </button>
          
          <button onClick={() => invoke('download_service', {
              name: 'mariadb-10.11.6-winx64', 
              url: 'https://archive.mariadb.org/mariadb-10.11.6/winx64-packages/mariadb-10.11.6-winx64.zip'
            }).then(() => alert("MariaDB Downloaded!"))} 
            className="w-full text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 p-2 rounded text-left flex items-center gap-2">
            <Download size={14} /> Get MariaDB
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
                <FrameworkIcon framework={project.framework} />
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
                  className={`p-2 rounded-full transition-colors ${
                    project.status === 'running' 
                    ? 'bg-red-50 text-red-500 hover:bg-red-100' 
                    : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100'
                  }`}
                >
                  {project.status === 'running' ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                
                <button 
                    onClick={() => openDetails(project)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                  >
                    <Info size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- PHP MANAGER MODAL --- */}
      {showPhpManager && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-10 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Settings size={20}/></div>
                    PHP Version Manager
                </h3>
                <button onClick={() => setShowPhpManager(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
             </div>
             
             <div className="p-6 overflow-y-auto space-y-6">
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Installed Versions</h4>
                    <div className="grid grid-cols-1 gap-2">
                        {installedPhp.length === 0 && <p className="text-sm text-slate-500 italic">No PHP versions found.</p>}
                        {installedPhp.map(v => (
                            <div key={v} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg group">
                                <span className="font-medium text-emerald-800">{v}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-600 font-bold">Installed</span>
                                    <button 
                                        onClick={() => handleDeletePhp(v)}
                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                                        title="Uninstall"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Available Presets</h4>
                    <div className="grid grid-cols-1 gap-2">
                        {phpPresets.map(preset => {
                            const isInstalled = installedPhp.includes(preset.name);
                            const isThisDownloading = downloadingVersion === preset.name;
                            // Disable if installed OR if ANYTHING is currently downloading
                            const isDisabled = isInstalled || (downloadingVersion !== null && !isThisDownloading);

                            return (
                                <div key={preset.version} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-slate-700">PHP {preset.version}</span>
                                        <span className="text-xs text-slate-400">{preset.name}</span>
                                    </div>
                                    <button 
                                        disabled={isDisabled}
                                        onClick={() => handleDownloadPhp(preset.name, preset.url)}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                                            isDisabled 
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                        }`}
                                    >
                                        {isInstalled ? 'Installed' : (isThisDownloading ? 'Downloading...' : 'Download')}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Download Custom Version</h4>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">PHP</span>
                            <input 
                                type="text" 
                                placeholder="e.g. 8.1.0"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-12 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={customPhpVersion}
                                onChange={(e) => setCustomPhpVersion(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={handleCustomDownload}
                            disabled={!customPhpVersion || downloadingVersion !== null}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                !customPhpVersion || downloadingVersion !== null
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                        >
                            Download
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                        Input specific version number (e.g., 8.1.0, 7.4.33). Will attempt to fetch from windows.php.net archives.
                    </p>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* INSTALLATION MODAL */}
      {isInstalling && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-10">
          <div className="bg-slate-900 text-slate-200 w-full max-w-3xl rounded-xl shadow-2xl border border-slate-700 flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
              <h3 className="font-bold flex items-center gap-2"><Terminal size={18}/> Installing Laravel...</h3>
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

      {/* Details Modal */}
      {isDetailsOpen && selectedProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-800">{selectedProject.name}</h3>
              <button onClick={() => setIsDetailsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="p-4 bg-slate-100 rounded-lg text-sm text-slate-600 mb-4">
                <strong>Debug Info:</strong><br/>
                Project Path: {selectedProject.path}<br/>
                Port: {selectedProject.port}
              </div>
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">PHP Version</span>
                  <select 
                    className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-500"
                    value={selectedProject.phpVersion} 
                    onChange={(e) => {
                        const newVersion = e.target.value;
                        setSelectedProject({ ...selectedProject, phpVersion: newVersion });
                        const updatedProjects = projects.map(p => 
                            p.id === selectedProject.id ? { ...p, phpVersion: newVersion } : p
                        );
                        updateAndSave(updatedProjects);
                    }}
                  >
                    <option value="Global">Global (Default)</option>
                    {installedPhp.length > 0 ? (
                         installedPhp.map(v => <option key={v} value={v}>{v}</option>)
                    ) : null}
                  </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
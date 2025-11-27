import { useState, useEffect } from 'react';
import {
  Play, Square, Trash2, Info,
  Globe, Activity, Settings,
  PlusCircle, CheckCircle, XCircle, Terminal, Database,
  Download, X, Star, Monitor, AlertTriangle, RefreshCw, AlertOctagon,
  Hash, ShieldCheck, ShieldAlert, Loader2, Server, KeyRound, ExternalLink, Palette
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
  const [adminerStatus, setAdminerStatus] = useState<ServiceStatus>('stopped');
  const [userHome, setUserHome] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [missingPaths, setMissingPaths] = useState<Record<string, boolean>>({});

  // Modals & Admin
  const [showPhpManager, setShowPhpManager] = useState(false);
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showAdminToast, setShowAdminToast] = useState(false);

  // DB Config State
  const [dbOldPass, setDbOldPass] = useState('');
  const [dbNewPass, setDbNewPass] = useState('');

  // Installer & Downloads
  const [composerLogs, setComposerLogs] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDownloadingMariaDB, setIsDownloadingMariaDB] = useState(false);
  const [isAdminerThemeDownloading, setIsAdminerThemeDownloading] = useState(false); // NEW

  // Stack Data
  const [installedPhp, setInstalledPhp] = useState<string[]>([]);
  const [isMariaDbInstalled, setIsMariaDbInstalled] = useState(false);
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
      setInstalledPhp(services.filter(s => s.startsWith('php-')));
      setIsMariaDbInstalled(services.some(s => s.startsWith('mariadb')));
      const active = await invoke<string>('get_active_version', { service: 'php' });
      setCurrentGlobalPhp(active);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await invoke('init_environment');
        const adminStatus = await invoke<boolean>('check_is_admin');
        setIsAdmin(adminStatus);
        if (adminStatus) {
          setShowAdminToast(true);
          setTimeout(() => setShowAdminToast(false), 4000);
        }
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

  // --- ADMINER THEMES ---
  const handleAdminerTheme = async () => {
    const themes = [
      { name: "Pappu687 (Light)", url: "https://www.adminer.org/download/v5.4.1/designs/pappu687/adminer.css" },
      { name: "MichaelGrznar (Dark)", url: "https://raw.githubusercontent.com/MichaelGrznar/adminer-dark-css/main/adminer-dark.css" },
      { name: "Simple Theme (Light)", url: "https://raw.githubusercontent.com/devknown/simple-theme/master/adminer.css" },
      { name: "Dracula (Dark)", url: "https://www.adminer.org/download/v5.4.1/designs/dracula/adminer-dark.css" }
    ];

    const list = themes.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
    const choice = prompt(`Select Theme (Enter Number):\n\n${list}`, "1");

    if (!choice) return;
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < themes.length) {
      const theme = themes[index];
      try {
        setIsAdminerThemeDownloading(true); // Show Loading UI

        // Download CSS to .stackmanager/adminer/adminer.css
        await invoke('install_adminer_file', {
          fileName: 'adminer.css',
          url: theme.url
        });

        await message(`Theme "${theme.name}" applied.\nReload Adminer to see changes.`, { title: "Success", kind: "info" });
      } catch (e) {
        await message(`Failed to apply theme: ${e}`, { title: "Error", kind: "error" });
      } finally {
        setIsAdminerThemeDownloading(false);
      }
    }
  };

  const toggleAdminer = async () => {
    if (adminerStatus === 'running') {
      await ServiceAPI.stop('adminer_service');
      setAdminerStatus('stopped');
      return;
    }
    try {
      setAdminerStatus('starting');
      // 1. Download index.php (Renamed from adminer.php for auto-index)
      await invoke('install_adminer_file', {
        fileName: 'index.php',
        url: 'https://www.adminer.org/latest.php'
      });

      let home = userHome || await invoke<string>('get_user_home');

      const phpPath = `${home}\\.stackmanager\\bin\\php\\php.exe`;
      const adminerDir = `${home}\\.stackmanager\\adminer`; // Point to FOLDER

      // Ensure PHP.ini is ready
      try { await invoke('prepare_php_ini', { binPathDir: `${home}\\.stackmanager\\bin\\php` }); } catch (e) { }

      // 2. Run PHP Server on the FOLDER (-t)
      // This enables "index.php" autoloading AND "adminer.css" loading
      await ServiceAPI.start({
        id: 'adminer_service',
        binPath: phpPath,
        args: ['-S', '127.0.0.1:9000', '-t', adminerDir]
      });

      setAdminerStatus('running');
      invoke('open_in_browser', { url: 'http://127.0.0.1:9000/?server=localhost&username=root' });
    } catch (e) {
      console.error(e);
      await message(`Failed to start Adminer: ${e}`, { title: "Error", kind: "error" });
      setAdminerStatus('error');
    }
  };

  const confirmDelete = async (action: 'files' | 'list') => {
    if (!projectToDelete) return;
    if (action === 'files') {
      try {
        await invoke('delete_project_dir', { path: projectToDelete.path });
        const updated = projects.filter(p => p.id !== projectToDelete.id);
        updateAndSave(updated);
        await message("Project files deleted.", { title: "Deleted", kind: "info" });
      } catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); }
    } else {
      const updated = projects.filter(p => p.id !== projectToDelete.id);
      updateAndSave(updated);
    }
    setProjectToDelete(null);
  };

  const handleSetGlobalPhp = async (folderName: string) => {
    try {
      await invoke('set_active_version', { service: 'php', versionFolder: folderName });
      await message(`Global PHP set to ${folderName}`, { title: 'Success', kind: 'info' });
      refreshData();
    } catch (e) { await message(`Failed: ${e}`, { title: 'Error', kind: 'error' }); }
  };

  const handleUpdateDbPassword = async () => {
    if (mysqlStatus !== 'running') {
      await message("Please start MariaDB first.", { title: "Service Stopped", kind: "warning" });
      return;
    }
    try {
      const folderName = "mariadb-10.11.6-winx64";
      const binDir = await invoke<string>('get_service_bin_path', { serviceName: folderName });
      await invoke('change_mariadb_password', { binPath: binDir, oldPass: dbOldPass, newPass: dbNewPass });
      await message("Root password updated successfully!", { title: "Success", kind: "info" });
      setDbOldPass('');
      setDbNewPass('');
      setShowDbConfig(false);
    } catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); }
  };

  const handleEditDomain = async (project: Project) => {
    if (!isAdmin) {
      await message("Run as Administrator to map domains.", { title: "Permission Denied", kind: "error" });
      return;
    }
    const newDomain = prompt("Enter custom domain (e.g., blog.test):", project.domain === 'localhost' ? '' : project.domain);
    if (newDomain && newDomain !== project.domain) {
      try {
        await invoke('add_host_entry', { domain: newDomain });
        const updated = { ...project, domain: newDomain };
        updateAndSave(projects.map(p => p.id === project.id ? updated : p));
        await message(`Domain mapped!`, { title: "Success", kind: "info" });
      } catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); }
    }
  };

  const openProjectUrl = (project: Project) => {
    const url = (project.domain && project.domain !== 'localhost')
      ? `http://${project.domain}`
      : `http://localhost:${project.port}`;
    invoke('open_in_browser', { url });
  };

  const toggleProjectService = async (project: Project) => {
    if (missingPaths[project.path] === false) { await message("Folder missing.", { title: "Error", kind: "error" }); return; }

    const backendId = `proj_${project.id}`;
    const newStatus = project.status === 'running' ? 'stopped' : 'running';
    const optimisitcStatus = (newStatus === 'running' ? 'starting' : 'stopped') as ServiceStatus;

    setProjects(projects.map(p => p.id === project.id ? { ...p, status: optimisitcStatus } : p));

    try {
      if (newStatus === 'running') {
        if (project.domain && project.domain !== 'localhost') {
          await invoke('register_proxy_route', { domain: project.domain, port: project.port });
        }

        let home = userHome || await invoke<string>('get_user_home');
        if (!userHome) setUserHome(home);

        let phpBinDir = `${home}\\.stackmanager\\bin\\php`;
        let phpPath = `${phpBinDir}\\php.exe`;

        if (project.phpVersion && project.phpVersion !== 'Global') {
          try {
            phpBinDir = await invoke<string>('get_service_bin_path', { serviceName: project.phpVersion });
            phpPath = `${phpBinDir}\\php.exe`;
          } catch (e) { console.warn("Using global PHP."); }
        }

        try {
          await invoke('prepare_php_ini', { binPathDir: phpBinDir });
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) { console.warn(e); }

        let args = [];
        if (project.framework === 'laravel') {
          args = ["artisan", "serve", "--host=127.0.0.1", `--port=${project.port}`];
        } else {
          let docRoot = project.path;
          if (project.framework === 'symfony') {
            docRoot = `${project.path}/public`;
          }
          args = ["-S", `127.0.0.1:${project.port}`, "-t", docRoot];
        }

        await ServiceAPI.start({ id: backendId, binPath: phpPath, args: args, cwd: project.path });
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

  const addNewProject = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        const name = selected.split(/[\\/]/).pop() || "Untitled";
        const detected = await invoke<string>('detect_framework', { path: selected });
        const existingPorts = projects.map(p => p.port);
        const nextPort = existingPorts.length > 0 ? Math.max(...existingPorts) + 1 : 8001;
        const newProj: Project = {
          id: crypto.randomUUID(), name, path: selected, framework: detected as any,
          domain: 'localhost', port: nextPort, status: 'stopped', phpVersion: 'Global'
        };
        updateAndSave([...projects, newProj]);
      }
    } catch (err) { console.error(err); }
  };

  const createLaravel = async () => {
    try {
      await invoke('init_composer');
      const parentFolder = await open({ directory: true, multiple: false });
      if (!parentFolder || typeof parentFolder !== 'string') return;
      const projectName = prompt("Project Name:", "my-blog");
      if (!projectName) return;

      setIsInstalling(true);
      setComposerLogs(["Starting Composer..."]);
      const unlisten = await listen<string>('composer-progress', (event) => setComposerLogs(prev => [...prev, event.payload]));
      const newPath = await invoke<string>('create_laravel_project', { projectName, parentFolder });
      unlisten();
      setIsInstalling(false);

      const existingPorts = projects.map(p => p.port);
      const nextPort = existingPorts.length > 0 ? Math.max(...existingPorts) + 1 : 8001;
      const newProj: Project = { id: crypto.randomUUID(), name: projectName, path: newPath, framework: 'laravel', domain: 'localhost', port: nextPort, status: 'stopped', phpVersion: 'Global' };
      updateAndSave([...projects, newProj]);
      await message("Laravel Project Created!", { title: "Success", kind: "info" });
    } catch (err) { setIsInstalling(false); await message(`Failed: ${err}`, { title: "Error", kind: "error" }); }
  };

  const handleDeletePhp = async (folderName: string) => {
    if (!await confirm(`Delete ${folderName}?`, { title: 'Confirm', kind: 'warning' })) return;
    try { await invoke('delete_service_folder', { folderName }); refreshData(); } catch (e) { alert("Delete failed: " + e); }
  };

  const handleDownloadPhp = async (name: string, url: string) => {
    setDownloadingVersion(name);
    try { await invoke('download_service', { name, url }); refreshData(); await message("Downloaded", { title: "Success", kind: "info" }); }
    catch (e) { await message(`Failed: ${e}`, { title: "Error", kind: "error" }); } finally { setDownloadingVersion(null); }
  };

  const handleDownloadMariaDB = async () => {
    setIsDownloadingMariaDB(true);
    try {
      await invoke('download_service', {
        name: 'mariadb-10.11.6-winx64',
        url: 'https://archive.mariadb.org/mariadb-10.11.6/winx64-packages/mariadb-10.11.6-winx64.zip'
      });
      refreshData();
      await message("MariaDB Downloaded!", { title: "Success", kind: "info" });
    } catch (e) {
      await message(`Failed to download MariaDB: ${e}`, { title: "Error", kind: "error" });
    } finally {
      setIsDownloadingMariaDB(false);
    }
  };

  const handleCustomDownload = async () => {
    if (!customPhpVersion) return;
    const parts = customPhpVersion.split('.');
    if (parts.length < 2) { alert("Invalid version"); return; }
    const major = parseInt(parts[0]); const minor = parseInt(parts[1]);
    let compiler = "vs16"; let arch = "x64";
    if (major === 5) { if (minor <= 4) { compiler = "VC9"; arch = "x86"; } else { compiler = "vc11"; } }
    else if (major === 7) { if (minor <= 1) compiler = "vc14"; else compiler = "vc15"; }
    const folderName = `php-${customPhpVersion}-Win32-${compiler}-${arch}`;
    const url = `https://windows.php.net/downloads/releases/archives/${folderName}.zip`;

    if (await confirm(`Download ${folderName}?`)) { handleDownloadPhp(folderName, url); }
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

  const toggleMySQL = async () => {
    const folderName = "mariadb-10.11.6-winx64";
    const serviceId = "global_mysql";
    if (mysqlStatus === 'running') { setMysqlStatus('stopped'); await ServiceAPI.stop(serviceId); }
    else { setMysqlStatus('starting'); try { await invoke('init_mysql', { versionFolder: folderName }); const binDir = await invoke<string>('get_service_bin_path', { serviceName: folderName }); const dataPath = `${userHome}\\.stackmanager\\data\\mysql`; await ServiceAPI.start({ id: serviceId, binPath: `${binDir}\\mysqld.exe`, args: ["--console", `--datadir=${dataPath}`] }); setMysqlStatus('running'); } catch (e) { setMysqlStatus('error'); } }
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

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden relative">
      {/* ... (Admin Toast same as before) ... */}
      {showAdminToast && (
        <div className="absolute top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300">
          <ShieldCheck size={20} />
          <div><p className="font-bold text-sm">Running as Administrator</p><p className="text-xs opacity-90">Full system access enabled.</p></div>
        </div>
      )}

      <div className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <h1 className="text-xl font-bold text-indigo-600">StackManager</h1>
        <p className="text-xs text-slate-400 mb-6">v0.2.0 Beta</p>

        {(installedPhp.length > 0 && isMariaDbInstalled) ? (
          <div className="mb-6 animate-in fade-in zoom-in duration-300">
            {/* ... (PHP and MariaDB cards same as before) ... */}
            <div className="mb-2 flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="flex items-center gap-3"><div className="p-2 bg-indigo-200 text-indigo-700 rounded"> <Monitor size={16} /> </div><div><div className="text-sm font-bold text-indigo-900">Global PHP</div><div className="text-[10px] text-indigo-500 truncate w-24" title={currentGlobalPhp}>{currentGlobalPhp}</div></div></div>
            </div>
            <div className="mb-2 flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3"><div className="p-2 bg-blue-100 text-blue-600 rounded"> <Database size={16} /> </div><div><div className="text-sm font-medium">MariaDB</div><div className="text-[10px] text-slate-400">Port 3306</div></div></div>
              <div className="flex gap-1">
                <button onClick={() => setShowDbConfig(true)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Settings size={14} /></button>
                <button onClick={toggleMySQL} className={`p-1.5 rounded transition-colors ${mysqlStatus === 'running' ? 'text-red-500 hover:bg-red-100' : 'text-emerald-500 hover:bg-emerald-100'}`}>{mysqlStatus === 'running' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
              </div>
            </div>

            {/* --- UPDATED ADMINER CARD --- */}
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
              <div className="flex items-center gap-3"><div className="p-2 bg-orange-200 text-orange-700 rounded"> <Server size={16} /> </div><div><div className="text-sm font-medium">Adminer</div><div className="text-[10px] text-slate-400">Port 9000</div></div></div>
              <div className="flex gap-1">
                {/* THEME BUTTON (Disabled while downloading) */}
                <button
                  onClick={handleAdminerTheme}
                  disabled={isAdminerThemeDownloading}
                  className={`p-1.5 rounded transition-colors ${isAdminerThemeDownloading ? 'text-orange-300' : 'text-orange-600 hover:bg-orange-200'}`}
                  title="Change Theme"
                >
                  {isAdminerThemeDownloading ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
                </button>

                {adminerStatus === 'running' && (
                  <button
                    onClick={() => invoke('open_in_browser', { url: 'http://127.0.0.1:9000/?server=localhost&username=root' })}
                    className="p-1.5 text-orange-600 hover:bg-orange-200 rounded transition-colors"
                    title="Open Adminer"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
                <button onClick={toggleAdminer} className={`p-1.5 rounded transition-colors ${adminerStatus === 'running' ? 'text-red-500 hover:bg-red-100' : 'text-emerald-500 hover:bg-emerald-100'}`}>{adminerStatus === 'running' ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-xs">
            <p className="font-bold mb-1">Setup Required</p>
            <p>Please download PHP and MariaDB from the Tools menu below to enable the Global Stack.</p>
          </div>
        )}

        {/* ... (Rest of sidebar tools same as before) ... */}
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400 mb-2">Tools</p>
          <button onClick={() => setShowPhpManager(true)} className="w-full text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 p-2 rounded text-left flex items-center gap-2"><Settings size={14} /> Manage PHP Versions</button>
          <button onClick={handleDownloadMariaDB} disabled={isDownloadingMariaDB || isMariaDbInstalled} className={`w-full text-xs p-2 rounded text-left flex items-center gap-2 transition-colors ${isMariaDbInstalled ? 'bg-green-50 text-green-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}>
            {isDownloadingMariaDB ? <Loader2 size={14} className="animate-spin" /> : (isMariaDbInstalled ? <CheckCircle size={14} /> : <Download size={14} />)}
            {isDownloadingMariaDB ? 'Downloading...' : (isMariaDbInstalled ? 'MariaDB Installed' : 'Get MariaDB')}
          </button>
        </div>
        <div className="mt-auto space-y-2">
          <button onClick={createLaravel} className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 py-2 px-4 rounded-lg text-sm font-medium border border-red-200"><PlusCircle size={16} /> New Laravel App</button>
          <button onClick={addNewProject} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg text-sm font-medium"><PlusCircle size={16} /> Import Project</button>
        </div>
      </div>

      <div className="flex-1 p-8">
        {/* ... (Header and Project List same as before) ... */}
        <header className="flex justify-between mb-8 items-center">
          <h2 className="text-2xl font-bold text-slate-700">My Projects</h2>
          {!isAdmin && isAdmin !== null && (<div className="bg-amber-100 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg flex items-center gap-3 text-sm"><ShieldAlert size={18} /><span>Restart as <strong>Administrator</strong> to enable Custom Domains (.test)</span></div>)}
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {projects.length === 0 && <div className="p-8 text-center text-slate-400">No projects yet.</div>}
          {projects.map((project) => {
            const isMissing = missingPaths[project.path] === false;
            return (
              <div key={project.id} className={`relative p-4 border-b last:border-0 ${isMissing ? 'bg-red-50/50' : ''}`}>
                {isMissing && (
                  <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-between px-6 backdrop-blur-[1px]">
                    <div className="flex items-center gap-3 text-red-600"><AlertTriangle size={20} /><div><p className="font-bold text-sm">Project Folder Missing</p><p className="text-xs text-red-400">{project.path}</p></div></div>
                    <div className="flex gap-2"><button onClick={() => setProjectToDelete(project)} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200">Remove</button><button onClick={() => handleReAddFolder(project)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 flex items-center gap-1"><RefreshCw size={12} /> Locate Folder</button></div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div><h3 className="font-medium">{project.name}</h3><div className="flex items-center gap-2 text-xs text-slate-400">{project.path}<span className="bg-slate-100 px-1 rounded text-slate-500">:{project.port}</span></div></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleEditDomain(project)} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-slate-600">{project.domain !== 'localhost' ? project.domain : 'Set Domain'}</button>
                    <a href="#" onClick={(e) => { e.preventDefault(); openProjectUrl(project); }} className="text-indigo-600 text-sm hover:underline flex items-center gap-1"><Globe size={14} /> {(project.domain && project.domain !== 'localhost') ? project.domain : `localhost:${project.port}`}</a>
                    <StatusIndicator status={project.status} />
                    <button onClick={() => toggleProjectService(project)} className={`p-2 rounded-full ${project.status === 'running' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>{project.status === 'running' ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                    <button onClick={() => openProjectTerminal(project)} className="p-2 text-slate-400 hover:text-slate-600"><Terminal size={18} /></button>
                    <button onClick={() => setIsDetailsOpen(true)} onClickCapture={() => setSelectedProject(project)} className="p-2 text-slate-400 hover:text-indigo-600"><Info size={18} /></button>
                    <button onClick={() => setProjectToDelete(project)} className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={18} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ... (Keep all modals: Details, PHP Manager, Installer, DB Config, Delete) ... */}
      {isDetailsOpen && selectedProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start"><h3 className="text-xl font-bold text-slate-800">{selectedProject.name}</h3><button onClick={() => setIsDetailsOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button></div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                <span className="text-sm font-medium text-slate-700">PHP Version</span>
                <select className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-500" value={selectedProject.phpVersion}
                  onChange={async (e) => {
                    const updatedProject = { ...selectedProject, phpVersion: e.target.value };
                    setSelectedProject(updatedProject);
                    updateAndSave(projects.map(p => p.id === selectedProject.id ? updatedProject : p));
                  }}>
                  <option value="Global">Global (Default)</option>
                  {installedPhp.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-2"><Hash size={14} /> App Port</span>
                <input type="number" className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 w-24 text-right focus:ring-2 focus:ring-indigo-500 outline-none" value={selectedProject.port} onChange={(e) => { const newPort = parseInt(e.target.value); const updatedProject = { ...selectedProject, port: newPort }; setSelectedProject(updatedProject); updateAndSave(projects.map(p => p.id === selectedProject.id ? updatedProject : p)); }} />
              </div>
              <p className="text-xs text-slate-400">Change port only if there is a conflict (e.g. Address already in use).</p>
            </div>
          </div>
        </div>
      )}

      {showPhpManager && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-10 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Settings size={20} /></div> PHP Version Manager</h3>
              <button onClick={() => setShowPhpManager(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Installed Versions</h4>
                <div className="grid grid-cols-1 gap-2">
                  {installedPhp.map(v => {
                    const isGlobal = v === currentGlobalPhp;
                    return (
                      <div key={v} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg group">
                        <span className="font-medium text-emerald-800">{v}</span>
                        <div className="flex items-center gap-2">
                          {isGlobal ? (
                            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle size={12} /> Currently Global</span>
                          ) : (
                            <button onClick={() => handleSetGlobalPhp(v)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded flex items-center gap-1"><Star size={12} /> Set Global</button>
                          )}
                          <button onClick={() => handleDeletePhp(v)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Available Presets</h4>
                <div className="grid grid-cols-1 gap-2">
                  {phpPresets.map(preset => {
                    const isInstalled = installedPhp.includes(preset.name);
                    const isDisabled = isInstalled || (downloadingVersion !== null && downloadingVersion !== preset.name);
                    return (
                      <div key={preset.version} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex flex-col"><span className="font-medium text-slate-700">PHP {preset.version}</span><span className="text-xs text-slate-400">{preset.name}</span></div>
                        <button disabled={isDisabled} onClick={() => handleDownloadPhp(preset.name, preset.url)} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${isDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>{isInstalled ? 'Installed' : (downloadingVersion === preset.name ? 'Downloading...' : 'Download')}</button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Download Custom Version</h4>
                <div className="flex gap-2"><input type="text" placeholder="e.g. 8.1.0" className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 py-2 text-sm" value={customPhpVersion} onChange={(e) => setCustomPhpVersion(e.target.value)} /><button onClick={handleCustomDownload} disabled={!customPhpVersion || downloadingVersion !== null} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white disabled:bg-gray-200">Download</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInstalling && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-10">
          <div className="bg-slate-900 text-slate-200 w-full max-w-3xl rounded-xl shadow-2xl border border-slate-700 flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl"><h3 className="font-bold flex items-center gap-2"><Terminal size={18} /> Installing Laravel...</h3><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div></div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1">{composerLogs.map((log, i) => (<div key={i} className="break-all">{log}</div>))}<div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}></div></div>
          </div>
        </div>
      )}

      {showDbConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-10 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings size={20} /> Configure MariaDB</h3>
              <button onClick={() => setShowDbConfig(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">MariaDB must be <strong>running</strong> to change the password. Default root password is empty.</div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Current Password</label>
                <div className="relative">
                  <input type="password" placeholder="(Leave empty if default)" className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={dbOldPass} onChange={(e) => setDbOldPass(e.target.value)} />
                  <KeyRound size={16} className="absolute left-3 top-2.5 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">New Password</label>
                <div className="relative">
                  <input type="password" placeholder="Enter new password" className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={dbNewPass} onChange={(e) => setDbNewPass(e.target.value)} />
                  <KeyRound size={16} className="absolute left-3 top-2.5 text-slate-400" />
                </div>
              </div>
              <button onClick={handleUpdateDbPassword} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition">Update Password</button>
            </div>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertOctagon size={32} /></div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Delete {projectToDelete.name}?</h3>
              <p className="text-slate-500 text-sm mb-6">You can remove this project from the list, or permanently delete the files from your computer.</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => confirmDelete('files')} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"><Trash2 size={18} /> Delete Files & Remove</button>
                <button onClick={() => confirmDelete('list')} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition">Remove from List Only</button>
                <button onClick={() => setProjectToDelete(null)} className="mt-2 text-slate-400 hover:text-slate-600 text-sm font-medium">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { 
  Play, Square, Trash2, Info, 
  Globe, Folder, Activity, Settings, 
  PlusCircle, CheckCircle, XCircle, Terminal
} from 'lucide-react';
import { ServiceAPI } from './api/serviceControl';

// --- Types ---
type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting';

interface Project {
  id: string;
  name: string;
  path: string;
  framework: 'laravel' | 'symfony' | 'wordpress' | 'nodejs' | 'unknown';
  domain: string;
  status: ServiceStatus;
  phpVersion: string;
  webServer: 'nginx' | 'apache';
  createdAt: string;
  lastActive: string;
}

// --- Mock Data ---
const initialProjects: Project[] = [
  {
    id: '1',
    name: 'E-Commerce API',
    path: 'C:/dev/ecommerce-api',
    framework: 'laravel',
    domain: 'api.shop.test',
    status: 'stopped',
    phpVersion: '8.2.14',
    webServer: 'nginx',
    createdAt: '2023-10-12',
    lastActive: 'Just now'
  },
  {
    id: '2',
    name: 'Client Portfolio',
    path: 'C:/dev/client-portfolio',
    framework: 'wordpress',
    domain: 'portfolio.test',
    status: 'stopped',
    phpVersion: '7.4.33',
    webServer: 'apache',
    createdAt: '2023-11-05',
    lastActive: '2 days ago'
  }
];

const FrameworkIcon = ({ framework }: { framework: string }) => {
  switch (framework) {
    case 'laravel': return <div className="w-8 h-8 bg-red-100 text-red-600 rounded flex items-center justify-center font-bold text-xs">Lr</div>;
    case 'symfony': return <div className="w-8 h-8 bg-black text-white rounded flex items-center justify-center font-bold text-xs">Sy</div>;
    case 'wordpress': return <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded flex items-center justify-center font-bold text-xs">Wp</div>;
    default: return <div className="w-8 h-8 bg-gray-100 text-gray-600 rounded flex items-center justify-center font-bold text-xs">?</div>;
  }
};

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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // --- Integration Logic ---
  const toggleProjectService = async (project: Project) => {
    const newStatus = project.status === 'running' ? 'stopped' : 'running';
    
    // 1. Optimistic Update
    setProjects(prev => prev.map(p => 
      p.id === project.id ? { ...p, status: newStatus === 'running' ? 'starting' : 'stopped' } : p
    ));

    try {
      const backendId = `proj_${project.id}`;

      if (newStatus === 'running') {
        console.log("Calling Rust to start service...");
        
        // NOTE: binPath must be a real file to work. 
        // For testing, we simulate a delay.
        /*
        await ServiceAPI.start({
           id: backendId,
           binPath: "C:/Windows/System32/notepad.exe", 
           args: []
        });
        */
        
        setTimeout(() => {
           setProjects(prev => prev.map(p => 
             p.id === project.id ? { ...p, status: 'running' } : p
           ));
        }, 1000);
        
      } else {
        // await ServiceAPI.stop(backendId);
        
        setProjects(prev => prev.map(p => 
          p.id === project.id ? { ...p, status: 'stopped' } : p
        ));
      }
    } catch (err) {
      console.error(err);
      setProjects(prev => prev.map(p => 
        p.id === project.id ? { ...p, status: 'error' } : p
      ));
    }
  };

  const openDetails = (project: Project) => {
    setSelectedProject(project);
    setIsDetailsOpen(true);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {/* --- Left Sidebar --- */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            StackManager
          </h1>
          <p className="text-xs text-slate-400 mt-1">v0.1.0 Dev</p>
        </div>

        <div className="mt-auto p-4 border-t border-slate-100">
          <button className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2 px-4 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20">
            <PlusCircle size={16} /> New Project
          </button>
          <div className="flex gap-2 mt-3 justify-center">
            <button className="p-2 hover:bg-slate-100 rounded-md text-slate-500"><Settings size={18}/></button>
            <button className="p-2 hover:bg-slate-100 rounded-md text-slate-500"><Terminal size={18}/></button>
          </div>
        </div>
      </div>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0">
        
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-700">My Projects</h2>
            <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full">{projects.length} active</span>
          </div>
          <div className="flex gap-3">
             <input 
              type="text" 
              placeholder="Search projects..." 
              className="bg-slate-100 border-none rounded-lg px-4 py-2 text-sm w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
             />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
            <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-4">Project</div>
              <div className="col-span-3">Domain</div>
              <div className="col-span-2">Stack</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {projects.map((project) => (
              <div key={project.id} className="grid grid-cols-12 gap-4 p-4 items-center border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                
                <div className="col-span-4 flex gap-3 items-center">
                  <FrameworkIcon framework={project.framework} />
                  <div className="min-w-0">
                    <h3 className="font-medium text-slate-700 truncate">{project.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-slate-400 truncate">
                      <Folder size={10} />
                      {project.path}
                    </div>
                  </div>
                </div>

                <div className="col-span-3">
                  <a href={`http://${project.domain}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-indigo-600 hover:underline truncate">
                    <Globe size={12} />
                    {project.domain}
                  </a>
                </div>

                <div className="col-span-2">
                  <div className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block">
                    PHP {project.phpVersion}
                  </div>
                </div>

                <div className="col-span-2">
                  <StatusIndicator status={project.status} />
                </div>

                <div className="col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => toggleProjectService(project)}
                    className={`p-1.5 rounded-md transition-colors ${project.status === 'running' ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                  >
                    {project.status === 'running' ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  </button>
                  <button 
                    onClick={() => openDetails(project)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                  >
                    <Info size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Details Modal --- */}
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
                Rust Backend is connected. Check console logs when you toggle the "Run" button.
              </div>
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">PHP Version</span>
                  <select 
                    className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1"
                    defaultValue={selectedProject.phpVersion}
                  >
                    <option>8.3.0</option>
                    <option>8.2.14</option>
                    <option>7.4.33</option>
                  </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
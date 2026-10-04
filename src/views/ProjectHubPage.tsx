import { useEffect, useState } from 'react';
import { useStoryFrameStore } from '@/store';
import { ProjectCard } from '@/components/ProjectCard';
import { FolderOpen, Plus } from 'lucide-react';

export function ProjectHubPage() {
  const { loadProject, createProject, recentProjects, loadRecentProjects, isLoading } = useStoryFrameStore();
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setIsCreating(false);
    setNewProjectName('');
  };

  return (
    <div className="flex flex-col items-center p-8 h-full bg-slate-950 overflow-y-auto w-full">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        <div className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">StoryFrame Studio</h1>
            <p className="text-slate-400 mt-2">Manage your animation projects</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
              disabled={isLoading}
            >
              <Plus size={18} />
              New Project
            </button>
            <button
              onClick={() => loadProject()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
              disabled={isLoading}
            >
              <FolderOpen size={18} />
              Open...
            </button>
          </div>
        </div>

        {isCreating && (
          <div className="bg-slate-900 border border-blue-900/50 p-6 rounded-lg flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-slate-200">Create New Project</h2>
            <div className="flex gap-4">
              <input 
                type="text" 
                placeholder="Project Name" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-4 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button 
                onClick={handleCreate}
                disabled={!newProjectName.trim() || isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                Create & Select Folder
              </button>
              <button 
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold text-slate-300 mb-4">Recent Projects</h2>
          {recentProjects.length === 0 ? (
            <div className="text-slate-500 italic p-8 text-center bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
              No recent projects found. Create or open one to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentProjects.map((p) => (
                <ProjectCard 
                  key={p.path} 
                  name={p.name} 
                  path={p.path} 
                  lastOpened={p.last_opened} 
                  onClick={() => loadProject(p.path)} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

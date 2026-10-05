import { useEffect, useState } from 'react';
import { useStoryFrameStore } from '@/store';
import { ProjectCard } from '@/components/ProjectCard';
import { FolderOpen, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfMotion } from '@/lib/motion';
import { invoke } from '@tauri-apps/api/core';

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

  const handleDelete = async (path: string, name: string) => {
    if (window.confirm(`'${name}' 프로젝트를 영구적으로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      try {
        await invoke('delete_project', { path });
        await loadRecentProjects();
      } catch (err) {
        console.error('Failed to delete project:', err);
        alert('프로젝트 삭제에 실패했습니다: ' + err);
      }
    }
  };

  return (
    <div className="flex flex-col items-center p-8 h-full bg-slate-950 overflow-y-auto w-full custom-scrollbar">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        <div className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">StoryFrame Studio</h1>
            <p className="text-slate-400 mt-2">애니메이션 프로젝트 관리</p>
          </div>
          <div className="flex gap-4">
            <motion.button
              {...sfMotion.hover}
              {...sfMotion.tap}
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              disabled={isLoading}
            >
              <Plus size={18} />
              새 프로젝트
            </motion.button>
            <motion.button
              {...sfMotion.hover}
              {...sfMotion.tap}
              onClick={() => loadProject()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              disabled={isLoading}
            >
              <FolderOpen size={18} />
              열기...
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {isCreating && (
            <motion.div 
              {...sfMotion.transition}
              className="bg-slate-900 border border-blue-900/50 p-6 rounded-lg flex flex-col gap-4 overflow-hidden"
            >
              <h2 className="text-xl font-semibold text-slate-200">새 프로젝트 생성</h2>
              <div className="flex gap-4">
                <input 
                  type="text" 
                  autoFocus
                  placeholder="프로젝트 이름" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-4 py-2 text-slate-200 focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <button 
                  onClick={handleCreate}
                  disabled={!newProjectName.trim() || isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  생성 및 폴더 선택
                </button>
                <button 
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  취소
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <h2 className="text-xl font-semibold text-slate-300 mb-4">최근 프로젝트</h2>
          {recentProjects.length === 0 ? (
            <div className="text-slate-500 italic p-8 text-center bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
              최근 프로젝트가 없습니다. 새 프로젝트를 생성하거나 열어주세요.
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
                  onDelete={() => handleDelete(p.path, p.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

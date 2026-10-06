import { motion } from 'framer-motion';
import { useStoryFrameStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { PanelLeftClose, PanelLeftOpen, Film, Music, Settings, Info, Users, Image as ImageIcon, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';


export function CollapsibleSidebar() {
  const isCollapsed = useStoryFrameStore((state) => state.project?.uiState.sidebarCollapsed ?? false);
  const synopsis = useStoryFrameStore((state) => state.project?.meta?.synopsis);
  const characterSheets = useStoryFrameStore(useShallow((state) => state.project?.globalAssets?.characterSheets));
  const moodboards = useStoryFrameStore(useShallow((state) => state.project?.globalAssets?.moodboards));
  const hasProject = useStoryFrameStore((state) => !!state.project);

  const toggleSidebar = useStoryFrameStore((state) => state.toggleSidebar);
  const currentTab = useStoryFrameStore((state) => state.currentTab);
  const setCurrentTab = useStoryFrameStore((state) => state.setCurrentTab);

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 48 : 280 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="h-full bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden shrink-0 z-10"
    >
      <div className="p-2 flex justify-between items-center border-b border-slate-800 h-12 shrink-0">
        {!isCollapsed && <span className="font-semibold text-slate-200 px-2 whitespace-nowrap">프로젝트 정보</span>}
        <button
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isCollapsed && "mx-auto"
          )}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="flex-1 flex flex-col py-4 gap-2 px-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <SidebarItem icon={<Film size={20} />} label="컷 관리" isCollapsed={isCollapsed} isActive={currentTab === 'cuts'} onClick={() => setCurrentTab('cuts')} />
        <SidebarItem icon={<Users size={20} />} label="캐릭터 보드" isCollapsed={isCollapsed} isActive={currentTab === 'characters'} onClick={() => setCurrentTab('characters')} />
        <SidebarItem icon={<MapPin size={20} />} label="장소 보드" isCollapsed={isCollapsed} isActive={currentTab === 'locations'} onClick={() => setCurrentTab('locations')} />
        <SidebarItem icon={<Music size={20} />} label="오디오" isCollapsed={isCollapsed} isActive={currentTab === 'audio'} onClick={() => setCurrentTab('audio')} />
        
        {hasProject && !isCollapsed && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4 mt-6 px-2"
          >
            {/* Synopsis */}
            {synopsis && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                  <Info size={16} />
                  <h3>시놉시스</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {synopsis}
                </p>
              </div>
            )}

            {/* Character DNA */}
            {characterSheets && characterSheets.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                  <Users size={16} />
                  <h3>캐릭터 속성 (DNA)</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {characterSheets.map((char) => (
                    <div key={char.id} className="bg-slate-800/50 rounded-md p-2 flex flex-col gap-1">
                      <span className="text-sm text-slate-200 font-medium">{char.name}</span>
                      <span className="text-xs text-slate-400">{char.styleNotes}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moodboard */}
            {moodboards && moodboards.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                  <ImageIcon size={16} />
                  <h3>무드보드</h3>
                </div>
                <div className="flex flex-col gap-4">
                  {moodboards.map((board) => (
                    <div key={board.id} className="flex flex-col gap-2">
                      <span className="text-xs text-slate-300 font-medium">{board.label}</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {board.imagePaths.map((path, idx) => (
                          <div key={idx} className="aspect-square bg-slate-800 rounded overflow-hidden">
                            <img 
                              src={path} 
                              alt={`${board.label} reference ${idx + 1}`} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                      {board.notes && <p className="text-xs text-slate-400 mt-1">{board.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        <div className="flex-1" />
        <SidebarItem icon={<Settings size={20} />} label="설정" isCollapsed={isCollapsed} isActive={currentTab === 'settings'} onClick={() => setCurrentTab('settings')} />
      </div>
    </motion.div>
  );
}

function SidebarItem({ icon, label, isCollapsed, isActive, onClick }: { icon: React.ReactNode; label: string; isCollapsed: boolean; isActive?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      aria-label={label}
      title={isCollapsed ? label : undefined}
      className={cn(
        "flex items-center p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary w-full",
        isCollapsed ? "justify-center" : "gap-3",
        isActive && "bg-slate-800 text-white"
      )}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!isCollapsed && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStoryFrameStore } from '@/store';
import { PanelLeftClose, PanelLeftOpen, Film, Music, Settings, Users, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAIN_TABS = [
  { id: 'cuts', label: '컷 관리', icon: Film },
  { id: 'characters', label: '캐릭터 보드', icon: Users },
  { id: 'locations', label: '장소 보드', icon: MapPin },
  { id: 'audio', label: '오디오', icon: Music },
] as const;


export function CollapsibleSidebar() {
  const isCollapsed = useStoryFrameStore((state) => state.project?.uiState.sidebarCollapsed ?? false);

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
        {MAIN_TABS.map(({ id, label, icon: Icon }) => (
          <SidebarItem 
            key={id}
            id={id}
            icon={<Icon size={20} />} 
            label={label} 
            isCollapsed={isCollapsed} 
            isActive={currentTab === id} 
            onClick={setCurrentTab} 
          />
        ))}
        
        <div className="flex-1" />
        <SidebarItem id="settings" icon={<Settings size={20} />} label="설정" isCollapsed={isCollapsed} isActive={currentTab === 'settings'} onClick={setCurrentTab} />
      </div>
    </motion.div>
  );
}

const SidebarItem = memo(function SidebarItem({ 
  id, icon, label, isCollapsed, isActive, onClick 
}: { 
  id: "cuts" | "audio" | "settings" | "characters" | "locations"; icon: React.ReactNode; label: string; isCollapsed: boolean; isActive?: boolean; onClick?: (id: "cuts" | "audio" | "settings" | "characters" | "locations") => void 
}) {
  const handleClick = useCallback(() => onClick?.(id), [id, onClick]);
  
  return (
    <button 
      onClick={handleClick}
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
});

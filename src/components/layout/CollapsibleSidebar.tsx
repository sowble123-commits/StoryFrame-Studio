import { motion } from 'framer-motion';
import { useStoryFrameStore } from '@/store';
import { PanelLeftClose, PanelLeftOpen, Film, Music, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CollapsibleSidebar() {
  const isCollapsed = useStoryFrameStore((state) => state.project?.uiState.sidebarCollapsed ?? false);
  const toggleSidebar = useStoryFrameStore((state) => state.toggleSidebar);

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 48 : 260 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="h-full bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden shrink-0"
    >
      <div className="p-2 flex justify-between items-center border-b border-slate-800 h-12 shrink-0">
        {!isCollapsed && <span className="font-semibold text-slate-200 px-2 whitespace-nowrap">Menu</span>}
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors",
            isCollapsed && "mx-auto"
          )}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <div className="flex-1 flex flex-col py-4 gap-2 px-2">
        <SidebarItem icon={<Film size={20} />} label="Cuts" isCollapsed={isCollapsed} />
        <SidebarItem icon={<Music size={20} />} label="Audio" isCollapsed={isCollapsed} />
        <div className="flex-1" />
        <SidebarItem icon={<Settings size={20} />} label="Settings" isCollapsed={isCollapsed} />
      </div>
    </motion.div>
  );
}

function SidebarItem({ icon, label, isCollapsed }: { icon: React.ReactNode; label: string; isCollapsed: boolean }) {
  return (
    <button className={cn(
      "flex items-center p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors",
      isCollapsed ? "justify-center" : "gap-3"
    )}>
      <div className="flex-shrink-0">{icon}</div>
      {!isCollapsed && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

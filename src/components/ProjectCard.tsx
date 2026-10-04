

import { sfMotion } from '@/lib/motion';
import { motion } from 'framer-motion';

interface ProjectCardProps {
  name: string;
  path: string;
  lastOpened: number;
  onClick: () => void;
}

export function ProjectCard({ name, path, lastOpened, onClick }: ProjectCardProps) {
  const dateStr = new Date(lastOpened * 1000).toLocaleString();

  return (
    <motion.div 
      {...sfMotion.hover}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Open project ${name}`}
      className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-blue-500 hover:bg-slate-800 transition-all cursor-pointer flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-200">{name}</h3>
        <span className="text-xs text-slate-500">{dateStr}</span>
      </div>
      <p className="text-sm text-slate-400 truncate" title={path}>{path}</p>
    </motion.div>
  );
}

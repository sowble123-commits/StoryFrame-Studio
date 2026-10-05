import { sfMotion } from '@/lib/motion';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface ProjectCardProps {
  name: string;
  path: string;
  lastOpened: number;
  onClick: () => void;
  onDelete?: () => void;
}

export function ProjectCard({ name, path, lastOpened, onClick, onDelete }: ProjectCardProps) {
  const dateStr = new Date(lastOpened * 1000).toLocaleString();

  return (
    <motion.div 
      {...sfMotion.hover}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Open project ${name}`}
      className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-blue-500 hover:bg-slate-800 transition-all cursor-pointer flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group relative"
    >
      <div className="flex justify-between items-center pr-8">
        <h3 className="text-lg font-semibold text-slate-200">{name}</h3>
        <span className="text-xs text-slate-500">{dateStr}</span>
      </div>
      <p className="text-sm text-slate-400 truncate" title={path}>{path}</p>

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-4 right-4 p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="프로젝트 삭제"
          aria-label="Delete project"
        >
          <Trash2 size={16} />
        </button>
      )}
    </motion.div>
  );
}

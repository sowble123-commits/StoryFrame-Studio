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
      className="bg-surface-0 border border-border rounded-lg p-4 hover:border-accent hover:bg-surface-1 transition-all cursor-pointer flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group relative"
    >
      <div className="flex justify-between items-center pr-8">
        <h3 className="text-lg font-semibold text-primary">{name}</h3>
        <span className="text-xs text-tertiary">{dateStr}</span>
      </div>
      <p className="text-sm text-secondary truncate" title={path}>{path}</p>

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-4 right-4 p-1.5 rounded text-tertiary hover:text-danger hover:bg-danger/20/30 opacity-0 group-hover:opacity-100 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="프로젝트 삭제"
          aria-label="Delete project"
        >
          <Trash2 size={16} />
        </button>
      )}
    </motion.div>
  );
}

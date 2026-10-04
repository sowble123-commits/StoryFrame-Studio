

interface ProjectCardProps {
  name: string;
  path: string;
  lastOpened: number;
  onClick: () => void;
}

export function ProjectCard({ name, path, lastOpened, onClick }: ProjectCardProps) {
  const dateStr = new Date(lastOpened * 1000).toLocaleString();

  return (
    <div 
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-blue-500 hover:bg-slate-800 transition-all cursor-pointer flex flex-col gap-2"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-200">{name}</h3>
        <span className="text-xs text-slate-500">{dateStr}</span>
      </div>
      <p className="text-sm text-slate-400 truncate" title={path}>{path}</p>
    </div>
  );
}

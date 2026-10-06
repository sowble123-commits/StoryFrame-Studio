import { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';
import { useStoryFrameStore } from '@/store';
import { Moodboard } from '@/types/project';
import { Plus, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export function LocationsPage() {
  const project = useStoryFrameStore((state) => state.project);
  const addMoodboard = useStoryFrameStore((state) => state.addMoodboard);

  const moodboards = project?.globalAssets?.moodboards || [];

  const handleAddDummy = () => {
    const dummyBoard: Moodboard = {
      id: `mood_${Date.now()}`,
      label: `Dummy Location ${moodboards.length + 1}`,
      imagePaths: [
        'https://via.placeholder.com/300x200/1e293b/94a3b8?text=Location+1',
        'https://via.placeholder.com/300x200/1e293b/94a3b8?text=Location+2'
      ],
      notes: 'Dummy location notes. Describe the atmosphere.'
    };
    addMoodboard(dummyBoard);
    toast.success('더미 장소가 추가되었습니다.');
  };

  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">장소 보드</h1>
          <p className="text-slate-400 mt-1">장소 및 배경 설정(Moodboard) 관리 화면입니다.</p>
        </div>
        <button
          onClick={handleAddDummy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors font-medium text-sm"
        >
          <Plus size={16} />
          더미 장소 추가
        </button>
      </div>
      
      {moodboards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-10 text-slate-500">
          <p>등록된 장소가 없습니다.</p>
          <p className="text-sm mt-2">상단의 버튼을 눌러 더미 장소를 추가해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {moodboards.map((board) => (
            <MoodboardCard key={board.id} board={board} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

const MoodboardCard = memo(function MoodboardCard({ board }: { board: Moodboard }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(board.notes);
    setCopied(true);
    toast.success('장소 노트가 복사되었습니다.');
    setTimeout(() => setCopied(false), 2000);
  }, [board.notes]);

  const primaryImage = board.imagePaths?.[0] || 'https://via.placeholder.com/300x200/1e293b/94a3b8?text=No+Image';

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300">
      <div className="relative aspect-[3/2] bg-slate-800 group overflow-hidden">
        <img
          src={primaryImage}
          alt={board.label}
          className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-500"
          draggable={true}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', primaryImage);
            e.dataTransfer.setData('text/uri-list', primaryImage);
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>
      
      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-slate-100 truncate" title={board.label}>
          {board.label}
        </h3>
        
        <div className="text-xs text-slate-400 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 flex-1 line-clamp-3 leading-relaxed" title={board.notes}>
          {board.notes || <span className="italic opacity-50">장소 노트 없음</span>}
        </div>
        
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-800/50 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg text-sm transition-all duration-200 mt-auto group/btn"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400 group-hover/btn:text-white" />
              <span className="text-emerald-400 group-hover/btn:text-white">복사됨</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>복사</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});

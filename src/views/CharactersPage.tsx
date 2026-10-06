import { useState } from 'react';
import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';
import { useStoryFrameStore } from '@/store';
import { CharacterSheet } from '@/types/project';
import { Plus, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export function CharactersPage() {
  const project = useStoryFrameStore((state) => state.project);
  const addCharacterSheet = useStoryFrameStore((state) => state.addCharacterSheet);

  const characterSheets = project?.globalAssets?.characterSheets || [];

  const handleAddDummy = () => {
    const dummySheet: CharacterSheet = {
      id: `char_${Date.now()}`,
      name: `Dummy Character ${characterSheets.length + 1}`,
      frontRefPath: 'https://via.placeholder.com/300x400/1e293b/94a3b8?text=Front+View',
      sideRefPath: 'https://via.placeholder.com/300x400/1e293b/94a3b8?text=Side+View',
      styleNotes: 'Dummy style notes. Add some prompt here.'
    };
    addCharacterSheet(dummySheet);
    toast.success('더미 캐릭터가 추가되었습니다.');
  };

  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">캐릭터 보드</h1>
          <p className="text-slate-400 mt-1">캐릭터 설정 및 프롬프트 관리 화면입니다.</p>
        </div>
        <button
          onClick={handleAddDummy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors font-medium text-sm"
        >
          <Plus size={16} />
          더미 캐릭터 추가
        </button>
      </div>
      
      {characterSheets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-10 text-slate-500">
          <p>등록된 캐릭터가 없습니다.</p>
          <p className="text-sm mt-2">상단의 버튼을 눌러 더미 캐릭터를 추가해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {characterSheets.map((sheet) => (
            <CharacterCard key={sheet.id} sheet={sheet} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CharacterCard({ sheet }: { sheet: CharacterSheet }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sheet.styleNotes);
    setCopied(true);
    toast.success('스타일 노트가 복사되었습니다.');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors shadow-sm">
      <div className="relative aspect-[3/4] bg-slate-800 group">
        <img
          src={sheet.frontRefPath}
          alt={sheet.name}
          className="w-full h-full object-cover select-none"
          draggable={true}
          onDragStart={(e) => {
            // Some native drop targets might benefit from this, but img natively supports dragging.
            e.dataTransfer.setData('text/plain', sheet.frontRefPath);
            e.dataTransfer.setData('text/uri-list', sheet.frontRefPath);
          }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
      </div>
      
      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-slate-200 truncate" title={sheet.name}>
          {sheet.name}
        </h3>
        
        <div className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800/50 flex-1 line-clamp-3" title={sheet.styleNotes}>
          {sheet.styleNotes || <span className="italic opacity-50">스타일 노트 없음</span>}
        </div>
        
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded text-sm transition-colors mt-auto"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span className="text-emerald-400">복사됨</span>
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
}

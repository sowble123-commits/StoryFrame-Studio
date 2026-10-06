import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

export function CharactersPage() {
  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-slate-100">캐릭터 보드</h1>
      <p className="text-slate-400">캐릭터 설정 및 프롬프트 관리 화면입니다.</p>
      {/* TODO: 캐릭터 보드 구현 (P2-02) */}
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

export function LocationsPage() {
  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-slate-100">장소 보드</h1>
      <p className="text-slate-400">장소/배경 설정 및 프롬프트 관리 화면입니다.</p>
      {/* TODO: 장소 보드 구현 */}
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';
import { Music, Upload, Volume2 } from 'lucide-react';

export function AudioPage() {
  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-canvas">
      <div>
        <h1 className="text-2xl font-bold text-primary">오디오 트랙</h1>
        <p className="text-secondary mt-1 text-sm">전체 프로젝트에 적용될 배경음악(BGM)과 음향 효과를 설정합니다.</p>
      </div>
      
      <div className="max-w-3xl flex flex-col gap-6">
        <div className="bg-surface-0 border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent/20 text-blue-400 rounded-lg">
              <Music size={20} />
            </div>
            <h2 className="text-lg font-bold text-primary">메인 BGM 트랙</h2>
          </div>
          
          <div className="border-2 border-dashed border-border-subtle hover:border-slate-500 bg-canvas/50 rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer group">
            <div className="w-12 h-12 bg-surface-1 rounded-full flex items-center justify-center text-secondary group-hover:bg-accent group-hover:text-white transition-colors">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <p className="text-secondary font-medium">오디오 파일 업로드</p>
              <p className="text-sm text-tertiary mt-1">클릭하거나 파일을 여기로 드래그하세요 (MP3, WAV)</p>
            </div>
          </div>
        </div>

        <div className="bg-surface-0/50 border border-border rounded-xl p-6 opacity-50 pointer-events-none">
          <div className="flex items-center gap-3 mb-4">
            <Volume2 size={20} className="text-secondary" />
            <h2 className="text-base font-bold text-secondary">효과음 관리 (개발 중)</h2>
          </div>
          <p className="text-sm text-tertiary">각 컷별 효과음과 보이스오버(TTS) 기능은 향후 업데이트에서 지원될 예정입니다.</p>
        </div>
      </div>
    </motion.div>
  );
}

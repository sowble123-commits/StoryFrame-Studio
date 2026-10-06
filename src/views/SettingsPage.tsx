import { motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';
import { Monitor, Database } from 'lucide-react';

export function SettingsPage() {
  return (
    <motion.div {...sfMotion.fade} className="w-full h-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-canvas">
      <div>
        <h1 className="text-2xl font-bold text-primary">환경 설정</h1>
        <p className="text-secondary mt-1 text-sm">앱 작동 방식과 단축키, 저장소 위치 등을 설정합니다.</p>
      </div>
      
      <div className="max-w-3xl flex flex-col gap-6">
        <div className="bg-surface-0 border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-surface-1 text-secondary rounded-lg">
              <Monitor size={20} />
            </div>
            <h2 className="text-lg font-bold text-primary">일반 설정</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="text-primary font-medium text-sm">테마</p>
                <p className="text-tertiary text-xs">앱 전체의 색상 테마를 선택합니다.</p>
              </div>
              <select className="bg-canvas border border-border-subtle text-secondary rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent">
                <option value="dark">다크 모드 (권장)</option>
                <option value="light">라이트 모드</option>
                <option value="system">시스템 설정 따름</option>
              </select>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-primary font-medium text-sm">자동 저장 간격</p>
                <p className="text-tertiary text-xs">작업 내역이 자동으로 파일에 저장되는 주기입니다.</p>
              </div>
              <select className="bg-canvas border border-border-subtle text-secondary rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent">
                <option value="1">1분</option>
                <option value="5">5분</option>
                <option value="10">10분</option>
                <option value="0">자동 저장 안 함</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-surface-0 border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-surface-1 text-secondary rounded-lg">
              <Database size={20} />
            </div>
            <h2 className="text-lg font-bold text-primary">저장소 및 백업</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-primary font-medium text-sm">기본 프로젝트 저장 위치</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value="C:\Users\Documents\StoryFrame Projects" 
                  className="flex-1 bg-canvas border border-border-subtle rounded px-3 py-2 text-secondary text-sm"
                />
                <button className="px-4 py-2 bg-surface-1 hover:bg-surface-2 text-primary rounded text-sm font-medium transition-colors">
                  변경
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

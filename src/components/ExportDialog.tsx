import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clips: { path: string; inPoint: number; outPoint: number }[];
  totalDuration?: number; // 선택: 알면 전달 (생략 시 백엔드가 ffprobe로 계산)
}

type ExportType = 'roughcut' | 'fcpxml' | 'capcut';

const EXPORT_CONFIG: Record<
  ExportType,
  { label: string; command: string; ext: string; filterName: string; defaultPath: string }
> = {
  roughcut: { label: 'Roughcut Video (.mp4)', command: 'assemble_roughcut', ext: 'mp4', filterName: 'Video', defaultPath: 'roughcut.mp4' },
  fcpxml: { label: 'FCPXML (Final Cut Pro)', command: 'export_fcpxml', ext: 'fcpxml', filterName: 'FCPXML', defaultPath: 'project.fcpxml' },
  capcut: { label: 'CapCut Draft (.json)', command: 'export_capcut', ext: 'json', filterName: 'JSON', defaultPath: 'draft_content.json' },
};

/** 렌더 중 예외로 앱 전체가 죽지 않도록 다이얼로그 단위로 격리 */
class ExportErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg w-96 text-slate-200 shadow-xl">
          <h2 className="text-lg font-bold mb-2 text-red-500">Export dialog crashed</h2>
          <pre className="text-xs bg-red-950/50 border border-red-900 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button className="mt-4 px-4 py-2 border border-slate-700 rounded hover:bg-slate-800 transition-colors" onClick={this.props.onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }
}

const ExportDialogInner: React.FC<ExportDialogProps> = ({ isOpen, onClose, clips, totalDuration }) => {
  const [exportType, setExportType] = useState<ExportType>('roughcut');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = () => {
    if (isExporting) return;
    setErrorMessage(null);
    setProgress(0);
    onClose();
  };

  const handleExport = async () => {
    const cfg = EXPORT_CONFIG[exportType];
    setErrorMessage(null);

    // 저장 위치 선택 (취소 시 조용히 종료)
    const filePath = await save({
      filters: [{ name: cfg.filterName, extensions: [cfg.ext] }],
      defaultPath: cfg.defaultPath,
    });
    if (!filePath) return;

    setIsExporting(true);
    setProgress(0);

    // invoke 이전에 리스너 등록 → 초기 progress 이벤트 유실 방지
    const unlisten = await listen<number>('render-progress', (e) => {
      setProgress(Math.max(0, Math.min(100, e.payload)));
    });

    try {
      await invoke(cfg.command, {
        clips,
        outputPath: filePath,
        ...(exportType === 'roughcut' && totalDuration ? { totalDuration } : {}),
      });
      setProgress(100);
      toast.success('내보내기 완료', { description: filePath });
      setIsExporting(false);
      handleClose();
      return;
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err as Error)?.message ?? String(err);
      console.error(err);
      setErrorMessage(msg); // 다이얼로그를 닫지 않고 stderr 원문 표시
      toast.error('내보내기 실패', {
        description: msg.split('\n').filter(Boolean).slice(-1)[0] ?? 'Unknown error',
      });
    } finally {
      unlisten();
      setIsExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="overlay"
          {...sfMotion.fade}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <motion.div 
            key="dialog"
            {...sfMotion.modal}
            className="bg-slate-900 border border-slate-800 p-6 rounded-lg w-96 text-slate-200 shadow-xl" 
            role="dialog" 
            aria-modal="true"
          >
            <h2 className="text-xl font-bold mb-4">Export Project</h2>

        <div className="flex flex-col gap-2 mb-6">
          {(Object.keys(EXPORT_CONFIG) as ExportType[]).map((type) => (
            <label
              key={type}
              className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition-colors ${
                exportType === type ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'
              } ${isExporting ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="exportType"
                value={type}
                checked={exportType === type}
                disabled={isExporting}
                onChange={() => setExportType(type)}
              />
              {EXPORT_CONFIG[type].label}
            </label>
          ))}
        </div>

        {isExporting && (
          <div className="mb-4">
            <div
              className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm mt-1 text-center tabular-nums">{Math.round(progress)}%</p>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4" role="alert">
            <p className="text-sm font-semibold text-red-600 mb-1">내보내기에 실패했습니다</p>
            <pre className="text-xs bg-red-50 border border-red-200 text-red-800 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">
              {errorMessage}
            </pre>
            <button
              className="text-xs underline mt-1 text-gray-600 hover:text-black"
              onClick={() => navigator.clipboard.writeText(errorMessage)}
            >
              오류 복사
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            className="px-4 py-2 border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors"
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            onClick={handleExport}
            disabled={isExporting || clips.length === 0}
          >
            {isExporting ? 'Exporting...' : errorMessage ? 'Retry' : 'Export'}
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ExportDialog: React.FC<ExportDialogProps> = (props) => (
  <ExportErrorBoundary onClose={props.onClose}>
    <ExportDialogInner {...props} />
  </ExportErrorBoundary>
);

export default ExportDialog;

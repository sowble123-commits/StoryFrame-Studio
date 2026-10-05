import { useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Clock, Zap, Gauge, Flame } from 'lucide-react';
import type { CutStory, CutIllustration } from '@/types/project';
import { useStoryFrameStore } from '@/store';
import { invoke } from '@tauri-apps/api/core';
import { getAssetUrl } from '@/lib/utils';
// ─── 작은 서브 컴포넌트 ────────────────────────────────────────────────────────

/** 레이블 + textarea 조합 필드. 재사용 가능. */
function EditField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="
          w-full resize-none rounded-lg border border-slate-700 bg-slate-950
          px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600
          focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40
          transition-colors duration-150
          scrollbar-thin scrollbar-thumb-slate-700
        "
      />
    </div>
  );
}

/** 읽기 전용 메타 행 */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 capitalize">{value}</span>
    </div>
  );
}

/** 모션 난이도 뱃지 */
function MotionBadge({ difficulty }: { difficulty: string }) {
  switch (difficulty) {
    case 'high':   return <span className="flex items-center gap-1 text-red-400"><Flame size={13} />High</span>;
    case 'medium': return <span className="flex items-center gap-1 text-yellow-400"><Zap size={13} />Medium</span>;
    case 'low':    return <span className="flex items-center gap-1 text-blue-400"><Gauge size={13} />Low</span>;
    default:       return <span className="text-slate-500">—</span>;
  }
}

// ─── PeekPanel ────────────────────────────────────────────────────────────────

export function PeekPanel() {
  // Selector 최적화: 필요한 slice만 구독
  const selectedCutId = useStoryFrameStore((s) => s.project?.uiState?.selectedCutId ?? null);
  const cut = useStoryFrameStore((s) => s.project?.cuts?.find((c) => c.id === selectedCutId));
  const setSelectedCutId = useStoryFrameStore((s) => s.setSelectedCutId);
  const updateCut = useStoryFrameStore((s) => s.updateCut);

  /** story 필드 부분 업데이트 헬퍼 */
  const patchStory = useCallback(
    (patch: Partial<CutStory>) => {
      if (!cut) return;
      updateCut(cut.id, { story: { ...cut.story, ...patch } });
    },
    [cut, updateCut],
  );

  /** illustration.camera 필드 부분 업데이트 헬퍼 */
  const patchCamera = useCallback(
    (patch: Partial<CutIllustration['camera']>) => {
      if (!cut) return;
      updateCut(cut.id, {
        illustration: {
          ...cut.illustration,
          camera: { ...cut.illustration.camera, ...patch },
        },
      });
    },
    [cut, updateCut],
  );

  return (
    <AnimatePresence>
      {cut && (
        <motion.aside
          key={cut.id}
          role="complementary"
          aria-label={`컷 ${cut.index} 상세 편집`}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 220, mass: 0.8 }}
          className="absolute top-0 right-0 w-80 h-full bg-slate-900 border-l border-slate-800 shadow-2xl z-40 flex flex-col"
        >
          {/* ── 헤더 ── */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 shrink-0">
            <h3 className="text-base font-semibold text-slate-200 font-mono">
              C{String(cut.index).padStart(3, '0')}
            </h3>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCutId(null)}
              aria-label="패널 닫기"
              className="text-slate-400 hover:text-slate-100 p-1.5 rounded-md hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* ── 스크롤 바디 ── */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

            {/* 섬네일 */}
            {cut.illustration.primaryImagePath ? (
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shrink-0">
                <img
                  src={cut.illustration.primaryImagePath}
                  alt={`컷 ${cut.index} 이미지`}
                  className="w-full object-cover max-h-40"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-600">
                <Image size={24} />
              </div>
            )}

            {/* ── 편집 폼 ── */}
            <EditField
              label="Description"
              value={cut.story.description}
              onChange={(v) => patchStory({ description: v })}
              rows={2}
              placeholder="컷에 대한 설명을 입력하세요…"
            />

            <EditField
              label="Lyrics / 대사"
              value={cut.story.lyrics}
              onChange={(v) => patchStory({ lyrics: v })}
              rows={3}
              placeholder="해당 구간의 가사 또는 대사…"
            />

            <EditField
              label="Camera Notes"
              value={cut.illustration.camera.notes}
              onChange={(v) => patchCamera({ notes: v })}
              rows={2}
              placeholder="카메라 앵글, 무브먼트 메모…"
            />

            {/* ── 읽기 전용 메타 ── */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Info</p>
              <MetaRow
                label="Duration"
                value={`${cut.timeline.effectiveDurationSec}s`}
              />
              <MetaRow
                label="Motion"
                value={<MotionBadge difficulty={cut.video.motionDifficulty} /> as any}
              />
              <MetaRow label="Illustration" value={cut.illustration.status} />
              <MetaRow label="Video" value={cut.video.status} />
              <MetaRow
                label="Camera"
                value={[cut.illustration.camera.angle, cut.illustration.camera.movement]
                  .filter(Boolean)
                  .join(' / ') || '—'}
              />
            </div>

            {/* ── 타임라인 ── */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Timeline</p>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={13} className="text-slate-500 shrink-0" />
                <span className="text-slate-500">In:</span>
                <span className="text-slate-300">{cut.timeline.inPointSec}s</span>
                <span className="text-slate-700 mx-1">→</span>
                <span className="text-slate-500">Out:</span>
                <span className="text-slate-300">{cut.timeline.outPointSec}s</span>
              </div>
              {(cut.timeline.transitionIn || cut.timeline.transitionOut) && (
                <div className="text-xs text-slate-600">
                  {cut.timeline.transitionIn && <span>In: {cut.timeline.transitionIn} </span>}
                  {cut.timeline.transitionOut && <span>Out: {cut.timeline.transitionOut}</span>}
                </div>
              )}
            </div>

            {/* ── 프레임 추출 ── */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  const projectPath = useStoryFrameStore.getState().project?.projectPath;
                  if (!projectPath) return;
                  
                  const activeVersion = cut.video.versions?.find(v => v.isSelected) || cut.video.versions?.[0];
                  if (!activeVersion) return;

                  try {
                    const outPath = await invoke<string>('extract_last_frame', {
                      videoPath: activeVersion.filePath,
                      timestamp: cut.timeline.outPointSec,
                      projectPath
                    });
                    updateCut(cut.id, {
                      video: { ...cut.video, lastFramePath: outPath }
                    });
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition-colors border border-slate-700 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Image size={16} />
                아웃(Out)점 프레임 추출
              </button>

              {cut.video.lastFramePath && (
                <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 shrink-0">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Next Cut Ref
                    </p>
                  </div>
                  <img
                    src={getAssetUrl(useStoryFrameStore.getState().project?.projectPath, cut.video.lastFramePath)}
                    alt={`컷 ${cut.index} 아웃점 프레임`}
                    className="w-full object-cover max-h-40"
                    draggable={false}
                  />
                </div>
              )}
            </div>

          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

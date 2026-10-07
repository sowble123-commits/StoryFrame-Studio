import { SafeImage } from '@/components/SafeImage';
import { useCallback, useEffect, useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Zap, Gauge, Flame, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { CutStory, CutIllustration, Frame } from '@/types/project';
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
      <label htmlFor={id} className="text-xs font-semibold text-secondary uppercase tracking-wide">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="
          w-full resize-none rounded-lg border border-border-subtle bg-canvas
          px-3 py-2 text-sm text-primary placeholder:text-slate-600
          focus:outline-none focus:border-accent focus:ring-1 focus:ring-blue-500/40
          transition-colors duration-150
          scrollbar-thin scrollbar-thumb-slate-700
        "
      />
    </div>
  );
}

/** 읽기 전용 메타 행 */
function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-tertiary">{label}</span>
      <span className="text-secondary capitalize">{value}</span>
    </div>
  );
}

/** 모션 난이도 뱃지 */
function MotionBadge({ difficulty }: { difficulty: string }) {
  switch (difficulty) {
    case 'high':   return <span className="flex items-center gap-1 text-danger"><Flame size={13} />High</span>;
    case 'medium': return <span className="flex items-center gap-1 text-yellow-400"><Zap size={13} />Medium</span>;
    case 'low':    return <span className="flex items-center gap-1 text-blue-400"><Gauge size={13} />Low</span>;
    default:       return <span className="text-tertiary">—</span>;
  }
}

const DEFAULT_BPM = 120;
const DEFAULT_BEAT_COUNT = '4';

function getPrimaryPrompt(frames: unknown): string {
  if (!Array.isArray(frames)) return '';
  const prompt = frames[0]?.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

// ─── PeekPanel ────────────────────────────────────────────────────────────────

export function PeekPanel() {
  const selectedCutId = useStoryFrameStore((s) => s.project?.uiState?.selectedCutId ?? null);
  const cut = useStoryFrameStore((s) => s.project?.cuts?.find((c) => c.id === selectedCutId));
  const setSelectedCutId = useStoryFrameStore((s) => s.setSelectedCutId);
  const updateCut = useStoryFrameStore((s) => s.updateCut);

  const musicBpm = useStoryFrameStore((state) => state.project?.music?.bpm);
  const bpm = typeof musicBpm === 'number' && Number.isFinite(musicBpm) && musicBpm > 0
    ? musicBpm
    : DEFAULT_BPM;
  const [beatCountInput, setBeatCountInput] = useState(DEFAULT_BEAT_COUNT);
  const savedPrompt = getPrimaryPrompt(cut?.frames);
  const [promptDraft, setPromptDraft] = useState(savedPrompt);

  const beatCount = Number(beatCountInput);
  const hasValidBeatCount = Number.isFinite(beatCount) && beatCount > 0;
  const applyBeatDuration = useCallback(() => {
    if (!cut || !hasValidBeatCount) {
      toast.error('0보다 큰 비트 수를 입력하세요.');
      return;
    }

    const duration = Number(((60 / bpm) * beatCount).toFixed(2));
    updateCut(cut.id, {
      durationSec: duration,
      timeline: {
        ...cut.timeline,
        effectiveDurationSec: duration,
        outPointSec: cut.timeline.inPointSec + duration,
      },
    });
    toast.success(bpm + ' BPM · ' + beatCount + ' beat = ' + duration + 's');
  }, [beatCount, bpm, cut, hasValidBeatCount, updateCut]);

  useEffect(() => {
    setPromptDraft(savedPrompt);
  }, [cut?.id, savedPrompt]);

  useEffect(() => {
    if (!cut?.id || promptDraft === savedPrompt) return;
    const timer = window.setTimeout(() => {
      const liveCut = useStoryFrameStore.getState().project?.cuts
        ?.find((candidate) => candidate.id === cut.id);
      if (!liveCut) return;
      const frames = Array.isArray(liveCut.frames) ? liveCut.frames : [];
      const nextFrames: Frame[] = frames.length
        ? [{ ...frames[0], prompt: promptDraft }, ...frames.slice(1)]
        : [{
            id: 'frame_' + liveCut.id + '_prompt',
            variants: [],
            isHardCut: false,
            prompt: promptDraft,
          }];
      updateCut(liveCut.id, { frames: nextFrames });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [cut?.id, promptDraft, savedPrompt, updateCut]);

  const patchStory = useCallback(
    (patch: Partial<CutStory>) => {
      if (!cut) return;
      updateCut(cut.id, { story: { ...cut.story, ...patch } });
    },
    [cut, updateCut],
  );

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
          className="absolute top-0 right-0 w-80 h-full bg-surface-0 border-l border-border shadow-2xl z-40 flex flex-col"
        >
          {/* ── 헤더 ── */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-base font-semibold text-primary font-mono">
              C{String(cut.index).padStart(3, '0')}
            </h3>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCutId(null)}
              aria-label="패널 닫기"
              className="text-secondary hover:text-primary p-1.5 rounded-md hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* ── 스크롤 바디 ── */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

            {/* 섬네일 */}
            {cut.illustration.primaryImagePath ? (
              <div className="rounded-lg overflow-hidden border border-border bg-canvas shrink-0">
                <SafeImage src={cut.illustration.primaryImagePath}
                  alt={`컷 ${cut.index} 이미지`}
                  className="w-full object-cover max-h-40"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center rounded-lg border border-dashed border-border-subtle text-slate-600">
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
            <div className="rounded-lg border border-border bg-canvas px-3 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-1">Info</p>
              <MetaRow
                label="Duration"
                value={`${cut.timeline.effectiveDurationSec}s`}
              />
              <MetaRow
                label="Motion"
                value={<MotionBadge difficulty={cut.video.motionDifficulty} /> }
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
            <div className='rounded-xl border border-border-subtle bg-canvas/70 p-3'>
              <div className='mb-3 flex items-start justify-between gap-3'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-wide text-secondary'>Timeline</p>
                  <p className='mt-1 text-[11px] text-tertiary'>{bpm} BPM · 1 beat = {(60 / bpm).toFixed(2)}s</p>
                </div>
                <span className='rounded-md border border-accent/20 bg-accent/10 px-2 py-1 font-mono text-[10px] font-semibold text-accent'>BPM</span>
              </div>
              <div className='grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border border-border-subtle bg-surface-1/70 p-2'>
                <label className='flex min-w-0 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary'>
                  Beat count
                  <input aria-label='비트 수' type='number' min='0.25' step='0.25' inputMode='decimal'
                    value={beatCountInput} onChange={(event) => setBeatCountInput(event.currentTarget.value)}
                    className='h-8 w-full rounded-md border border-border-subtle bg-canvas px-2 font-mono text-sm font-medium normal-case tracking-normal text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20' />
                </label>
                <button type='button' disabled={!hasValidBeatCount} onClick={applyBeatDuration} className='h-8 rounded-md border border-accent/40 bg-accent px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-2 disabled:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'>
                  길이 적용
                </button>
              </div>
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
                className="w-full px-4 py-2 bg-surface-1 hover:bg-surface-2 text-primary text-sm rounded-lg transition-colors border border-border-subtle flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Image size={16} />
                아웃(Out)점 프레임 추출
              </button>

              {cut.video.lastFramePath && (
                <div className="rounded-lg overflow-hidden border border-border bg-canvas shrink-0">
                  <div className="px-3 py-2 border-b border-border bg-surface-0 flex justify-between items-center">
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
                      Next Cut Ref
                    </p>
                  </div>
                  <SafeImage src={getAssetUrl(useStoryFrameStore.getState().project?.projectPath, cut.video.lastFramePath)}
                    alt={`컷 ${cut.index} 아웃점 프레임`}
                    className="w-full object-cover max-h-40"
                    draggable={false}
                  />
                </div>
              )}
            </div>

            {/* ── 제미나이 연동 프롬프트 에디터 ── */}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  제미나이/미드저니 프롬프트
                </label>
                <button
                  onClick={() => {
                    const textToCopy = cut.frames[0]?.prompt || cut.story.description;
                    if (!textToCopy) {
                      toast.error("복사할 프롬프트가 없습니다.");
                      return;
                    }
                    navigator.clipboard.writeText(textToCopy);
                    toast.success("프롬프트가 복사되었습니다.");
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 hover:bg-accent text-secondary hover:text-white transition-colors text-xs font-medium"
                >
                  <Copy size={13} />
                  <span>복사</span>
                </button>
              </div>
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.currentTarget.value)}
                className="rounded-xl border border-border-subtle bg-surface-0/70 p-3 shadow-inner shadow-black/10 w-full h-32 text-primary text-sm focus:outline-none focus:border-accent transition-colors resize-y custom-scrollbar placeholder:text-tertiary"
                placeholder="여기에 제미나이나 미드저니에 붙여넣을 완성된 프롬프트를 작성하세요..."
              />
            </div>

          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

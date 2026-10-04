import { memo, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStoryFrameStore } from '@/store';
import { resolveProjectPath } from '@/lib/utils';

const TRACK_HEIGHT = 64;
const BAR_STEP = 4; // CSS px
/** 브라우저 canvas 최대 치수(안전값). 초과 시 화면에 보이는 영역만 그린다. */
const MAX_CANVAS_WIDTH = 16000;

/**
 * 백엔드 `generate_waveform` 응답을 0..1로 정규화된 Float32Array로 변환.
 * 허용 형식: number[] | { peaks: number[] }
 */
function normalizePeaks(raw: unknown): Float32Array {
  const arr: ArrayLike<number> = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { peaks?: unknown } | null)?.peaks)
      ? (raw as { peaks: number[] }).peaks
      : [];
  const out = new Float32Array(arr.length);
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs(Number(arr[i]) || 0);
    out[i] = v;
    if (v > max) max = v;
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

/** 오디오 경로별 peak 캐시 (줌/리마운트 시 FFmpeg 재호출 방지, 동시 요청 합치기) */
const peaksCache = new Map<string, Promise<Float32Array>>();

function loadPeaks(audioPath: string): Promise<Float32Array> {
  let p = peaksCache.get(audioPath);
  if (!p) {
    p = invoke<unknown>('generate_waveform', { audioPath })
      .then(normalizePeaks)
      .catch((err) => {
        peaksCache.delete(audioPath); // 실패는 캐시하지 않음 (재시도 가능)
        throw err;
      });
    peaksCache.set(audioPath, p);
  }
  return p;
}

type PeaksState =
  | { status: 'idle' | 'loading' | 'error'; peaks: null }
  | { status: 'ready'; peaks: Float32Array };

function useWaveformPeaks(audioPath: string): PeaksState {
  const [state, setState] = useState<PeaksState>({ status: 'idle', peaks: null });

  useEffect(() => {
    if (!audioPath) {
      setState({ status: 'idle', peaks: null });
      return;
    }
    let cancelled = false; // 경로 변경/언마운트 시 stale 응답 무시
    setState({ status: 'loading', peaks: null });
    loadPeaks(audioPath)
      .then((peaks) => {
        if (!cancelled) setState({ status: 'ready', peaks });
      })
      .catch((err) => {
        console.error('[WaveformTrack] generate_waveform failed:', err);
        if (!cancelled) setState({ status: 'error', peaks: null });
      });
    return () => {
      cancelled = true;
    };
  }, [audioPath]);

  return state;
}

export const WaveformTrack = memo(function WaveformTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const duration = useStoryFrameStore((s) => s.project?.music?.durationSec ?? 180);
  const filePath = useStoryFrameStore((s) => s.project?.music?.filePath ?? '');
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath ?? '');
  const markers = useStoryFrameStore((s) => s.project?.music?.beatMarkers);

  const audioPath = filePath ? resolveProjectPath(projectPath, filePath) : '';
  const { status, peaks } = useWaveformPeaks(audioPath);

  const cssWidth = Math.min(MAX_CANVAS_WIDTH, Math.ceil(duration * pixelsPerSecond));

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      rafRef.current = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cssWidth;
      const h = TRACK_HEIGHT;

      // 치수가 실제로 바뀔 때만 버퍼 재할당 (재할당은 비싸고 깜빡임 유발)
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!peaks || peaks.length === 0 || duration <= 0) return;

      ctx.fillStyle = '#3b82f6';
      const n = peaks.length;
      const mid = h / 2;
      const maxHalf = (h - 4) / 2;

      // 단일 Path로 일괄 fill → draw call 최소화
      ctx.beginPath();
      for (let x = 0; x < w; x += BAR_STEP) {
        // 바가 덮는 시간 구간 [t0, t1) → peak 인덱스 구간 (전체 길이 = duration)
        const t0 = x / pixelsPerSecond;
        const t1 = (x + BAR_STEP) / pixelsPerSecond;
        if (t0 >= duration) break;
        const i0 = Math.min(n - 1, Math.floor((t0 / duration) * n));
        const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil((Math.min(t1, duration) / duration) * n)));

        let amp = 0;
        for (let i = i0; i < i1; i++) if (peaks[i] > amp) amp = peaks[i];

        const half = Math.max(1, amp * maxHalf);
        ctx.rect(x, mid - half, BAR_STEP - 1, half * 2);
      }
      ctx.fill();
    };

    const schedule = () => {
      if (rafRef.current) return; // 한 프레임에 최대 1회 (RAF 디바운스)
      rafRef.current = requestAnimationFrame(draw);
    };

    schedule();

    // 컨테이너 리사이즈(창 크기 변경)도 RAF로 합쳐서 처리
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [cssWidth, pixelsPerSecond, peaks, duration]);

  return (
    <div
      ref={wrapRef}
      className="relative h-16 border-b border-slate-800 bg-slate-900/50"
      aria-busy={status === 'loading'}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" aria-hidden="true" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center pl-3 text-xs text-slate-500 pointer-events-none">
          파형 분석 중…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center pl-3 text-xs text-red-400/80 pointer-events-none" role="status">
          파형을 불러오지 못했습니다
        </div>
      )}
      {markers?.map((m, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px bg-yellow-500/50 pointer-events-none z-10"
          style={{ left: m.timeSec * pixelsPerSecond }}
        />
      ))}
    </div>
  );
});

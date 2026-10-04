import { memo, useEffect, useMemo, useRef } from 'react';
import { useStoryFrameStore } from '@/store';

const TRACK_HEIGHT = 64;
const BAR_STEP = 4; // CSS px
/** 브라우저 canvas 최대 치수(안전값). 초과 시 화면에 보이는 영역만 그린다. */
const MAX_CANVAS_WIDTH = 16000;

/** 결정론적 의사난수(mulberry32) — 렌더마다 파형이 바뀌는 Math.random 제거 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시간축 기반 진폭: 줌이 바뀌어도 같은 시각은 같은 높이 (bucket = 0.04s) */
function amplitudeAt(bucket: number, seed: number) {
  return mulberry32(seed ^ Math.imul(bucket, 2654435761))();
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const WaveformTrack = memo(function WaveformTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const duration = useStoryFrameStore((s) => s.project?.music?.durationSec ?? 180);
  const filePath = useStoryFrameStore((s) => s.project?.music?.filePath ?? '');
  const markers = useStoryFrameStore((s) => s.project?.music?.beatMarkers);
  const seed = useMemo(() => hashString(filePath || 'default'), [filePath]);

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
      ctx.fillStyle = '#3b82f6';

      // 단일 Path로 일괄 fill → draw call 최소화
      ctx.beginPath();
      for (let x = 0; x < w; x += BAR_STEP) {
        const t = x / pixelsPerSecond;
        const amp = amplitudeAt(Math.floor(t / 0.04), seed);
        const bh2 = 10 + amp * (h - 14);
        ctx.rect(x, (h - bh2) / 2, BAR_STEP - 1, bh2);
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
  }, [cssWidth, pixelsPerSecond, seed]);

  return (
    <div ref={wrapRef} className="relative h-16 border-b border-slate-800 bg-slate-900/50">
      <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" aria-hidden="true" />
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

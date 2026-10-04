import { useEffect, useRef } from 'react';
import { useStoryFrameStore } from '@/store';

export function WaveformTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const music = useStoryFrameStore(s => s.project?.music);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const duration = music?.durationSec || 180;
    const width = duration * pixelsPerSecond;
    const height = 64; // match container height
    
    // Set canvas dimensions
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    ctx.clearRect(0, 0, width, height);

    // Mock waveform drawing
    ctx.fillStyle = '#3b82f6'; // blue-500
    const step = 4;
    for (let i = 0; i < width; i += step) {
      const h = Math.random() * (height - 10) + 10;
      ctx.fillRect(i, (height - h) / 2, step - 1, h);
    }
  }, [music?.durationSec, pixelsPerSecond]);

  const markers = music?.beatMarkers || [];

  return (
    <div className="relative h-16 border-b border-slate-800 bg-slate-900/50 flex items-center">
      {/* Waveform Canvas */}
      <canvas ref={canvasRef} className="absolute top-0 bottom-0 pointer-events-none h-full" />

      {/* Beat Markers */}
      {markers.map((marker, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px bg-yellow-500/50 pointer-events-none z-10"
          style={{ left: `${marker.timeSec * pixelsPerSecond}px` }}
        />
      ))}
    </div>
  );
}

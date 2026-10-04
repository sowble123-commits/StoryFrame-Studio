import React, { useRef, useEffect } from 'react';
import { useStoryFrameStore } from '@/store';
import { WaveformTrack } from './WaveformTrack';
import { VideoTrack } from './VideoTrack';
import { Play, Pause } from 'lucide-react';

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTime = useStoryFrameStore(s => s.currentTime);
  const isPlaying = useStoryFrameStore(s => s.isPlaying);
  const setCurrentTime = useStoryFrameStore(s => s.setCurrentTime);
  const setIsPlaying = useStoryFrameStore(s => s.setIsPlaying);
  const zoom = useStoryFrameStore(s => s.project?.uiState?.timelineZoom ?? 100);

  const PIXELS_PER_SECOND = zoom;
  const music = useStoryFrameStore(s => s.project?.music);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Audio Playback Sync
  useEffect(() => {
    if (audioRef.current && music?.filePath) {
      if (!audioRef.current.src.endsWith(music.filePath)) {
        audioRef.current.src = music.filePath;
      }
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.2) {
        audioRef.current.currentTime = currentTime;
      }
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [currentTime, isPlaying, music?.filePath]);

  // Update store time based on audio playback to drive the playhead smoothly
  useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      if (isPlaying && audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };
    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateTime);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, setCurrentTime]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const newTime = Math.max(0, x / PIXELS_PER_SECOND);
    setCurrentTime(newTime);
  };

  const playheadX = currentTime * PIXELS_PER_SECOND;

  return (
    <div className="flex flex-col h-full bg-slate-900 border-t border-slate-800 text-slate-300 relative">
      <audio ref={audioRef} className="hidden" />
      {/* Toolbar */}
      <div className="flex items-center p-2 border-b border-slate-800 bg-slate-950">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 transition-colors"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="ml-4 font-mono text-xs">
          {currentTime.toFixed(2)}s
        </div>
      </div>

      {/* Tracks Container */}
      <div 
        className="relative flex-1 overflow-auto overflow-x-scroll"
        ref={containerRef}
        onClick={handleTimelineClick}
      >
        <div className="relative min-w-full" style={{ width: `${Math.max(1000, (music?.durationSec || 180) * PIXELS_PER_SECOND)}px` }}>
          {/* Tracks */}
          <VideoTrack pixelsPerSecond={PIXELS_PER_SECOND} />
          <WaveformTrack pixelsPerSecond={PIXELS_PER_SECOND} />

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
            style={{ left: `${playheadX}px` }}
          >
            <div className="w-3 h-3 bg-red-500 rounded-full -translate-x-1.5 -translate-y-1.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

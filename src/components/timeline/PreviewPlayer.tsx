import { useRef, useEffect } from 'react';
import { useStoryFrameStore } from '@/store';

export function PreviewPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTime = useStoryFrameStore(s => s.currentTime);
  const isPlaying = useStoryFrameStore(s => s.isPlaying);
  const cuts = useStoryFrameStore(s => s.project?.cuts || []);

  let currentStart = 0;
  const activeCutProps = cuts.map(cut => {
    const start = currentStart;
    const duration = cut.timeline.effectiveDurationSec;
    currentStart += duration;
    return { cut, start, end: start + duration };
  }).find(props => currentTime >= props.start && currentTime < props.end);

  const activeVersion = activeCutProps?.cut.video.versions?.find(v => v.isSelected) || activeCutProps?.cut.video.versions?.[0];
  const videoSource = activeVersion?.filePath;

  useEffect(() => {
    if (videoRef.current && videoSource) {
      // Very naive implementation of sync
      if (!videoRef.current.src.endsWith(videoSource)) {
        videoRef.current.src = videoSource;
      }
      
      if (activeCutProps) {
        const localTime = (currentTime - activeCutProps.start) + activeCutProps.cut.timeline.inPointSec;
        if (Math.abs(videoRef.current.currentTime - localTime) > 0.2) {
          videoRef.current.currentTime = localTime;
        }
      }

      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [currentTime, isPlaying, videoSource, activeCutProps]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl relative">
      <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-black/60 rounded text-xs font-mono text-slate-300 backdrop-blur">
        Preview Player
      </div>
      <div className="flex-1 bg-black relative flex items-center justify-center">
        {videoSource ? (
          <video 
            ref={videoRef}
            className="w-full h-full object-contain"
            muted // audio synced via separate audio tag
            playsInline
          />
        ) : (
           <div className="text-slate-600 text-sm">No video source</div>
        )}
      </div>
    </div>
  );
}

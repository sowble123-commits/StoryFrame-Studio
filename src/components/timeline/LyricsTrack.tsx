import { useStoryFrameStore } from '@/store';

export function LyricsTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const cuts = useStoryFrameStore((s) => s.project?.cuts);
  
  if (!cuts) return null;

  return (
    <div className="relative h-10 border-b border-border bg-surface-1 flex items-center overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface-1 to-transparent z-10 pointer-events-none" />
      <div className="flex h-full items-center">
        {cuts.map((cut) => {
          const width = cut.timeline.effectiveDurationSec * pixelsPerSecond;
          return (
            <div
              key={cut.id}
              className="shrink-0 h-full border-r border-border-subtle flex items-center px-2"
              style={{ width: `${Math.max(0, width)}px` }}
              title={cut.story.lyrics}
            >
              <span className="text-[11px] text-tertiary truncate w-full font-medium">
                {cut.story.lyrics || <span className="opacity-50">Empty</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

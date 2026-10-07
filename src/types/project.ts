export interface ProjectMeta {
  id: string;
  title: string;
  genre: string;
  createdAt: string;
  updatedAt: string;
  synopsis: string;
  targetDurationSec: number;
  thumbnailPath: string;
}

export interface PendingTask {
  cutId: string;
  task: string;
  note: string;
}

export interface ProjectProgress {
  phase: string;
  totalCuts: number;
  completedCuts: number;
  pendingTasks: PendingTask[];
}

export interface BeatMarker {
  timeSec: number;
  type: string;
}

export interface MusicSection {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  lyrics: string;
}

export interface ProjectMusic {
  filePath: string;
  durationSec: number;
  bpm: number;
  waveformCachePath: string;
  beatMarkers: BeatMarker[];
  sections: MusicSection[];
}

export interface CharacterImage {
  id: string;
  url: string;
  label: string; // e.g. '정면', '측면', '표정', etc.
}

export const EMPTY_CHARACTER_IMAGES: readonly CharacterImage[] = Object.freeze([]);

export function isCharacterImage(value: unknown): value is CharacterImage {
  if (typeof value !== 'object' || value === null) return false;
  const image = value as Record<string, unknown>;
  return (
    typeof image.id === 'string' && image.id.trim().length > 0 &&
    typeof image.url === 'string' && image.url.trim().length > 0 &&
    typeof image.label === 'string'
  );
}

export function normalizeCharacterImages(value: unknown): readonly CharacterImage[] {
  if (!Array.isArray(value) || value.length === 0) {
    return EMPTY_CHARACTER_IMAGES;
  }

  const ids = new Set<string>();
  let isSafe = true;
  for (const image of value) {
    if (!isCharacterImage(image) || ids.has(image.id)) {
      isSafe = false;
      break;
    }
    ids.add(image.id);
  }
  if (isSafe) return value as CharacterImage[];

  const unique: CharacterImage[] = [];
  const seen = new Set<string>();
  for (const image of value) {
    if (isCharacterImage(image) && !seen.has(image.id)) {
      seen.add(image.id);
      unique.push(image);
    }
  }
  return unique;
}

export interface CharacterSheet {
  id: string;
  name: string;
  images: CharacterImage[];
  styleNotes: string;
}

export interface Moodboard {
  id: string;
  label: string;
  imagePaths: string[];
  notes: string;
}

export interface GlobalAssets {
  characterSheets: CharacterSheet[];
  moodboards: Moodboard[];
}

export interface CutStory {
  description: string;
  lyrics: string;
  timeRange: { startSec: number; endSec: number };
}

export interface CutIllustration {
  status: string;
  primaryImagePath: string;
  variantPaths: string[];
  characterRefs: string[];
  moodboardRefs: string[];
  camera: { angle: string; movement: string; notes: string };
}

export interface VideoVersion {
  versionId: string;
  filePath: string;
  durationSec: number;
  generatedBy: string;
  generatedAt: string;
  isSelected: boolean;
  thumbnailPath: string;
  notes: string;
}

export interface CutVideo {
  status: string;
  motionDifficulty: string;
  motionDescription: string;
  versions: VideoVersion[];
  lastFramePath: string;
}

export interface CutTimeline {
  inPointSec: number;
  outPointSec: number;
  effectiveDurationSec: number;
  absoluteStartSec: number;
  transitionIn: string;
  transitionOut: string;
}

export interface Frame {
  id: string;
  F0_reference?: string;
  variants: unknown[];
  isHardCut: boolean;
  description?: string;
  prompt?: string;
}

export interface Take {
  id: string;
  index: number;
  sectionId: string;
  story: CutStory;
  illustration: CutIllustration;
  video: CutVideo;
  timeline: CutTimeline;
  variants: unknown[];
  isHardCut: boolean;
  F0_reference: string;
  
  frames: Frame[];
  videoVersion?: string | null;
  durationSec: number;
}

// Alias for backward compatibility with untouched UI components
export type Cut = Take;

export interface Clip {
  id: string;
  index: number;
  takes: Take[];
}

export interface Sequence {
  id: string;
  index: number;
  label: string;
  clips: Clip[];
}

export interface RoughCut {
  lastAssembledAt: string;
  outputPath: string;
  totalDurationSec: number;
  cutOrder: string[];
}

export interface UiState {
  selectedCutId?: string | null;
  selectedSequenceId?: string | null;
  selectedClipId?: string | null;
  sidebarCollapsed: boolean;
  timelineZoom: number;
  gridColumns: number;
  timelineVisible?: boolean;
}

export interface ProjectState {
  $schema?: string;
  version: string;
  projectPath?: string;
  meta: ProjectMeta;
  progress: ProjectProgress;
  music: ProjectMusic;
  globalAssets: GlobalAssets;
  sequences: Sequence[];
  cuts: Cut[]; // Keep for UI components, sync'd from sequences
  roughCut: RoughCut;
  uiState: UiState;
}

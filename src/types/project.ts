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

export interface CharacterSheet {
  id: string;
  name: string;
  frontRefPath: string;
  sideRefPath: string;
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

export interface Cut {
  id: string;
  index: number;
  sectionId: string;
  story: CutStory;
  illustration: CutIllustration;
  video: CutVideo;
  timeline: CutTimeline;
}

export interface RoughCut {
  lastAssembledAt: string;
  outputPath: string;
  totalDurationSec: number;
  cutOrder: string[];
}

export interface UiState {
  selectedCutId: string | null;
  sidebarCollapsed: boolean;
  timelineZoom: number;
  gridColumns: number;
}

export interface ProjectState {
  $schema?: string;
  version: string;
  meta: ProjectMeta;
  progress: ProjectProgress;
  music: ProjectMusic;
  globalAssets: GlobalAssets;
  cuts: Cut[];
  roughCut: RoughCut;
  uiState: UiState;
}

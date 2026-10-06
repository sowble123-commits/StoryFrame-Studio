import { describe, it, expect } from 'vitest';
import type { Sequence, Clip, Take, CutFrame } from '../../src/types/project';

describe('Project Data Architecture', () => {
  it('should support Sequence -> Clip -> Take/Frame hierarchy', () => {
    const frame: CutFrame = {
      id: 'frame-1',
      F0_reference: 'path/to/img.png',
      variants: ['path/to/var1.png', 'path/to/var2.png'],
      isHardCut: true,
      description: 'test description',
      prompt: 'test prompt'
    };

    const take: Take = {
      id: 'take-1',
      frames: [frame],
      videoVersion: 'path/to/video.mp4',
      durationSec: 3.5
    };

    const clip: Clip = {
      id: 'clip-1',
      takes: [take]
    };

    const sequence: Sequence = {
      id: 'seq-1',
      clips: [clip],
      label: 'Intro Sequence'
    };

    expect(sequence.id).toBe('seq-1');
    expect(sequence.clips[0].takes[0].frames[0].isHardCut).toBe(true);
    expect(sequence.clips[0].takes[0].frames[0].F0_reference).toBe('path/to/img.png');
    expect(sequence.clips[0].takes[0].frames[0].variants).toContain('path/to/var1.png');
  });
});

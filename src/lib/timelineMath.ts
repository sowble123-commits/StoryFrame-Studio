/** 타임라인 순수 수학 유틸 (React 의존 없음, 테스트 용이) */

/** 오름차순 정렬된 배열에서 target에 가장 가까운 값의 인덱스 (이진 탐색, O(log n)) */
export function nearestIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // lo = target 이상인 첫 원소. 직전 원소와 비교
  if (lo > 0 && Math.abs(sorted[lo - 1] - target) <= Math.abs(sorted[lo] - target)) return lo - 1;
  return lo;
}

/**
 * Beat magnet snap.
 * 절대 위치(시작 위치 + 총 델타)에 대해 계산하므로 빠른 드래그로 pointermove가
 * 드문드문 와도 스냅 판정이 누락되지 않는다 (증분 누적 오차 없음).
 */
export function snapToBeat(sortedBeats: readonly number[], time: number, thresholdSec = 0.05): number {
  const i = nearestIndex(sortedBeats, time);
  if (i === -1) return time;
  return Math.abs(sortedBeats[i] - time) <= thresholdSec ? sortedBeats[i] : time;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

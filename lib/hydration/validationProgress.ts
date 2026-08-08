export function getNextValidationProgress(previousProgress: number): number {
  return previousProgress >= 90 ? previousProgress : Math.min(previousProgress + 10, 90);
}

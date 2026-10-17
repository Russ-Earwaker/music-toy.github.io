// Learning consumes a musical occurrence; it must never replace a Structure's
// identity or move its assigned entry to the next cycle.
export function patternLearningStartTick(panel, instance, currentTick, fallbackTick) {
  if (!panel.__sequenceDefinitionId) return fallbackTick;
  if (instance?.active && instance.structureTurnId &&
      currentTick >= instance.startTick && currentTick < instance.endTick) return instance.startTick;
  return panel.__getSequenceNextTurn?.(currentTick)?.startTick ?? fallbackTick;
}

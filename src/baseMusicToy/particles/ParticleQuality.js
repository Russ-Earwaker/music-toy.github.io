// src/particles/ParticleQuality.js
// Global particle quality tiers + FPS-driven LOD with toy-count and memory awareness.
// All toys and particle systems should use this instead of rolling their own.

export const QUALITY = {
  ULTRA: 'ultra',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

// ============================================================================
// Global State
// ============================================================================

let currentQuality = QUALITY.ULTRA;
let lastFpsSample = 60;
let smoothedFps = 60;
let qualityLock = null; // when set, prevents FPS-driven changes
let emergencyMode = false;
let emergencySince = 0;
let emergencyExitSince = 0;

// ============================================================================
// Configuration Constants
// ============================================================================

// Low-pass filter for noisy FPS samples so we don't thrash quality tiers.
const FPS_SMOOTH_ALPHA = 0.18;

// Emergency mode thresholds
const EMERGENCY_FPS_ENTER = 20; // Lowered from 22 for less aggressive triggering
const EMERGENCY_FPS_EXIT = 26;  // Lowered from 28 for faster exit
const EMERGENCY_SUSTAIN_MS = 800; // Reduced from 1200 for faster response
const EMERGENCY_EXIT_SUSTAIN_MS = 1000; // Reduced for faster recovery
const EMERGENCY_FIELD_OFF_FPS = 18;

// Toy count normalization reference (32 toys is typical)
const REFERENCE_TOY_COUNT = 32;
const MAX_TOY_COUNT_SCALAR = 2.0; // Don't normalize more than 2x for very high counts

// Memory thresholds (in MB) - refined based on P3f stress test findings
// P3f showed peak 73MB used with 93MB total, so we lower thresholds for more headroom
const MEMORY_WARNING_MB = 38; // Lowered from 45 to catch growth earlier
const MEMORY_CRITICAL_MB = 54; // Lowered from 60 to provide safety margin

// Heap usage percentage thresholds for proactive scaling
const HEAP_USAGE_WARNING_PCT = 55;
const HEAP_USAGE_CRITICAL_PCT = 75;

// Heap growth rate tracking for early warning
const HEAP_GROWTH_WINDOW_MS = 5000; // 5 second window
const HEAP_GROWTH_WARNING_RATE = 0.5; // MB per second
const HEAP_GROWTH_CRITICAL_RATE = 1.5; // MB per second

// Heap growth tracking state
const heapGrowthTracker = {
  samples: [],
  maxSamples: 50, // Track up to 50 samples in the window
  lastGrowthCheck: 0,
};

// ============================================================================
// Toy Count & Memory Tracking
// ============================================================================

let activeToyCount = REFERENCE_TOY_COUNT;
let lastMemoryCheck = 0;
let memoryPressureLevel = 0; // 0=none, 1=warning, 2=critical

/**
 * Set the current active toy count for normalization.
 * More toys = harder to maintain FPS, so we normalize thresholds.
 */
export function setActiveToyCount(count) {
  if (Number.isFinite(count) && count > 0) {
    activeToyCount = Math.max(1, count);
  }
}

/**
 * Get current active toy count.
 */
export function getActiveToyCount() {
  return activeToyCount;
}

/**
 * Get current memory pressure level.
 */
export function getMemoryPressureLevel() {
  return memoryPressureLevel;
}

/**
 * Check heap growth rate for proactive memory pressure detection.
 * Returns: 0=normal, 1=warning growth rate, 2=critical growth rate
 */
function checkHeapGrowthRate(nowMs) {
  // Throttle growth checks to once per second
  if (nowMs - heapGrowthTracker.lastGrowthCheck < 1000) {
    return 0;
  }
  heapGrowthTracker.lastGrowthCheck = nowMs;
  
  try {
    const memory = performance?.memory;
    if (!memory?.usedJSHeapSize) return 0;
    
    const usedMB = memory.usedJSHeapSize / 1048576;
    const totalMB = memory.totalJSHeapSize / 1048576;
    
    // Add new sample
    heapGrowthTracker.samples.push({ ts: nowMs, used: usedMB });
    
    // Remove old samples outside the window
    const windowStart = nowMs - HEAP_GROWTH_WINDOW_MS;
    while (heapGrowthTracker.samples.length > 0 && heapGrowthTracker.samples[0].ts < windowStart) {
      heapGrowthTracker.samples.shift();
    }
    
    // Need at least 2 samples to calculate growth
    if (heapGrowthTracker.samples.length < 2) {
      return 0;
    }
    
    const first = heapGrowthTracker.samples[0];
    const last = heapGrowthTracker.samples[heapGrowthTracker.samples.length - 1];
    const durationSec = (last.ts - first.ts) / 1000;
    
    if (durationSec < 1) return 0; // Not enough time elapsed
    
    const growthMB = last.used - first.used;
    const growthRate = growthMB / durationSec; // MB per second
    
    // Log growth rate for debugging
    try {
      if (window.__PERF_LAB_VERBOSE && growthRate > HEAP_GROWTH_WARNING_RATE) {
        console.log('[Particles][memory] growth rate', {
          rate: growthRate.toFixed(3),
          samples: heapGrowthTracker.samples.length,
          duration: durationSec.toFixed(1),
          growthMB: growthMB.toFixed(2),
        });
      }
    } catch {}
    
    // Check growth rate thresholds
    if (growthRate >= HEAP_GROWTH_CRITICAL_RATE) {
      return 2; // Critical growth rate
    } else if (growthRate >= HEAP_GROWTH_WARNING_RATE) {
      return 1; // Warning growth rate
    }
    
    // Also check heap usage percentage
    const usagePercent = (usedMB / totalMB) * 100;
    if (usagePercent >= HEAP_USAGE_CRITICAL_PCT) {
      return 2; // Critical heap usage
    } else if (usagePercent >= HEAP_USAGE_WARNING_PCT) {
      return 1; // Warning heap usage
    }
    
    return 0; // Normal
  } catch {
    return 0;
  }
}

/**
 * Update memory pressure based on current heap usage and growth rate.
 */
function updateMemoryPressure(nowMs) {
  if (nowMs - lastMemoryCheck < 1000) return; // Only check once per second
  lastMemoryCheck = nowMs;
  
  try {
    const memory = performance?.memory;
    if (memory && memory.usedJSHeapSize) {
      const usedMB = memory.usedJSHeapSize / 1048576;
      const prevLevel = memoryPressureLevel;
      
      // Check heap growth rate first (proactive detection)
      const growthLevel = checkHeapGrowthRate(nowMs);
      
      // Determine pressure level from multiple sources
      let newLevel = 0;
      
      // From absolute thresholds
      if (usedMB >= MEMORY_CRITICAL_MB) {
        newLevel = 2;
      } else if (usedMB >= MEMORY_WARNING_MB) {
        newLevel = 1;
      }
      
      // From growth rate (can elevate pressure level)
      if (growthLevel > newLevel) {
        newLevel = growthLevel;
      }
      
      memoryPressureLevel = newLevel;
      
      if (prevLevel !== memoryPressureLevel) {
        try {
          if (window.__PERF_LAB_VERBOSE) {
            console.log('[Particles][memory] pressure', {
              level: memoryPressureLevel,
              usedMB: Math.round(usedMB),
              growthLevel,
              prevLevel,
            });
          }
        } catch {}
      }
    }
  } catch {}
}

/**
 * Calculate FPS adjustment factor based on active toy count.
 * More toys = we expect lower FPS, so we adjust thresholds accordingly.
 */
function getToyCountFactor() {
  // Use square root scaling for smoother adaptation
  const factor = Math.sqrt(REFERENCE_TOY_COUNT / activeToyCount);
  return Math.min(factor, MAX_TOY_COUNT_SCALAR);
}

/**
 * Get adjusted FPS considering toy count and memory pressure.
 */
function getAdjustedFps(fps) {
  const toyFactor = getToyCountFactor();
  const adjusted = fps * toyFactor;
  
  // Memory pressure reduces effective FPS further
  if (memoryPressureLevel >= 2) {
    return adjusted * 0.8; // 20% reduction for critical memory
  } else if (memoryPressureLevel >= 1) {
    return adjusted * 0.9; // 10% reduction for warning memory
  }
  
  return adjusted;
}

// ============================================================================
// Quality Update Function
// ============================================================================

/**
 * Call this from the global FPS HUD once per frame-ish.
 * It maps a recent FPS sample to a quality tier with hysteresis.
 * 
 * @param {number} fps - Current FPS sample
 * @param {object} options - Optional configuration
 * @param {number} options.toyCount - Override active toy count
 * @param {boolean} options.skipMemoryCheck - Skip memory check this frame
 */
export function updateParticleQualityFromFps(fps, options = {}) {
  if (!Number.isFinite(fps) || fps <= 0) return;
  
  const { toyCount, skipMemoryCheck } = options || {};
  const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  
  // Update toy count if provided
  if (Number.isFinite(toyCount) && toyCount > 0) {
    activeToyCount = Math.max(1, toyCount);
  }
  
  // Update memory pressure (throttled to once per second)
  if (!skipMemoryCheck) {
    updateMemoryPressure(nowTs);
  }
  
  lastFpsSample = fps;
  if (!Number.isFinite(smoothedFps)) smoothedFps = fps;
  smoothedFps = smoothedFps + (fps - smoothedFps) * FPS_SMOOTH_ALPHA;
  
  // Calculate adjusted FPS for quality decisions
  const adjustedFps = getAdjustedFps(fps);
  const emergencySample = Math.min(adjustedFps, lastFpsSample); // Use raw sample for stability
  
  const prevEmergency = emergencyMode;
  
  // Emergency mode detection - consider memory pressure
  const emergencyTrigger = emergencySample <= EMERGENCY_FPS_ENTER || memoryPressureLevel >= 2;
  const emergencyExit = emergencySample >= EMERGENCY_FPS_EXIT && memoryPressureLevel < 2;
  
  if (emergencyTrigger) {
    if (!emergencySince) emergencySince = nowTs;
    emergencyExitSince = 0;
    if (!emergencyMode && (nowTs - emergencySince) >= EMERGENCY_SUSTAIN_MS) {
      emergencyMode = true;
    }
  } else if (emergencyExit) {
    emergencySince = 0;
    if (emergencyMode) {
      if (!emergencyExitSince) emergencyExitSince = nowTs;
      if ((nowTs - emergencyExitSince) >= EMERGENCY_EXIT_SUSTAIN_MS) {
        emergencyMode = false;
        emergencyExitSince = 0;
      }
    } else {
      emergencyExitSince = 0;
    }
  } else if (!emergencyMode) {
    emergencySince = 0;
    emergencyExitSince = 0;
  }
  
  if (prevEmergency !== emergencyMode) {
    try { if (window.__PERF_LAB_VERBOSE) console.log('[Particles][emergency] mode', { 
      active: emergencyMode, 
      fps: lastFpsSample, 
      adjustedFps,
      smoothed: smoothedFps,
      memoryLevel: memoryPressureLevel 
    }); } catch {}
  }
  
  // Expose emergency mode to window for debugging
  try {
    window.__DG_EMERGENCY_MODE = emergencyMode;
    if (emergencyMode) window.__DG_EMERGENCY_MODE_TS = nowTs;
  } catch {}
  
  if (qualityLock) {
    currentQuality = qualityLock;
    return currentQuality;
  }
  
  // Hysteretic mapping using ADJUSTED FPS to avoid chatter around thresholds.
  const q = currentQuality;
  const afps = adjustedFps;
  
  if (afps >= 57 || (q === QUALITY.ULTRA && afps >= 54)) {
    currentQuality = QUALITY.ULTRA;
  } else if (afps >= 45 || (q === QUALITY.HIGH && afps >= 41)) {
    currentQuality = QUALITY.HIGH;
  } else if (afps >= 32 || (q === QUALITY.MEDIUM && afps >= 29)) {
    currentQuality = QUALITY.MEDIUM;
  } else {
    currentQuality = QUALITY.LOW;
  }
}

// ============================================================================
// Quality Getters
// ============================================================================

export function getParticleQuality() {
  return currentQuality;
}

export function getSmoothedFps() {
  return smoothedFps;
}

export function getLastFpsSample() {
  return lastFpsSample;
}

// Benchmark/testing helper: lock particle quality to a fixed tier (or null to unlock).
export function setParticleQualityLock(q) {
  if (q == null) { qualityLock = null; return; }
  const s = String(q).toLowerCase();
  qualityLock =
    s === QUALITY.ULTRA ? QUALITY.ULTRA :
    s === QUALITY.HIGH ? QUALITY.HIGH :
    s === QUALITY.MEDIUM ? QUALITY.MEDIUM :
    s === QUALITY.LOW ? QUALITY.LOW :
    QUALITY.ULTRA;
  currentQuality = qualityLock;
}

export function getParticleQualityLock() { return qualityLock; }
export function getEmergencyParticleMode() { return emergencyMode; }

// ============================================================================
// Per-Toy Budget Coordinator
// ============================================================================

// Global state for budget coordination
const budgetCoordinator = {
  totalBudgetShare: 1.0,
  registeredToys: new Map(),
  lastAllocationUpdate: 0,
  ALLOCATION_UPDATE_INTERVAL: 500, // ms
};

/**
 * Register a toy for coordinated budget allocation.
 * @param {string} toyId - Unique identifier for the toy
 * @param {number} priority - Higher priority toys get more budget (0-1)
 */
export function registerToyForBudget(toyId, priority = 0.5) {
  budgetCoordinator.registeredToys.set(toyId, {
    priority: Math.max(0, Math.min(1, priority)),
    allocatedShare: 0,
    lastFrameTime: 0,
  });
}

/**
 * Unregister a toy from budget coordination.
 */
export function unregisterToyFromBudget(toyId) {
  budgetCoordinator.registeredToys.delete(toyId);
}

/**
 * Update toy frame time for load balancing.
 */
export function reportToyFrameTime(toyId, frameMs) {
  const toy = budgetCoordinator.registeredToys.get(toyId);
  if (toy) {
    toy.lastFrameTime = frameMs;
  }
}

/**
 * Get coordinated budget share for a specific toy.
 * Returns a multiplier (0-1) to apply to the toy's budget.
 */
export function getCoordinatedBudgetShare(toyId) {
  const now = performance.now();
  if (now - budgetCoordinator.lastAllocationUpdate > budgetCoordinator.ALLOCATION_UPDATE_INTERVAL) {
    updateBudgetAllocation();
  }
  
  const toy = budgetCoordinator.registeredToys.get(toyId);
  return toy?.allocatedShare ?? 1.0;
}

/**
 * Update budget allocation based on registered toys and their loads.
 */
function updateBudgetAllocation() {
  const now = performance.now();
  budgetCoordinator.lastAllocationUpdate = now;
  
  const toys = Array.from(budgetCoordinator.registeredToys.values());
  const count = toys.length;
  
  if (count === 0) {
    budgetCoordinator.totalBudgetShare = 1.0;
    return;
  }
  
  // Calculate base shares by priority
  const totalPriority = toys.reduce((sum, t) => sum + t.priority, 0);
  const baseShares = toys.map(t => ({
    ...t,
    baseShare: totalPriority > 0 ? t.priority / totalPriority : 1 / count,
  }));
  
  // Adjust shares based on frame time load (toys using more time get less budget)
  const maxFrameTime = Math.max(...baseShares.map(t => t.lastFrameTime || 1), 1);
  const adjustedShares = baseShares.map(t => {
    const loadFactor = 1 - (Math.min(t.lastFrameTime || 1, maxFrameTime) / maxFrameTime) * 0.3;
    return t.baseShare * loadFactor;
  });
  
  // Normalize shares
  const totalAdjusted = adjustedShares.reduce((sum, s) => sum + s, 0) || 1;
  baseShares.forEach((t, i) => {
    t.allocatedShare = adjustedShares[i] / totalAdjusted;
  });
  
  // Apply to registered toys
  baseShares.forEach((t, i) => {
    const toy = Array.from(budgetCoordinator.registeredToys.values())[i];
    if (toy) {
      toy.allocatedShare = t.allocatedShare;
    }
  });
  
  // Update global share (inverse of count to prevent over-allocation)
  budgetCoordinator.totalBudgetShare = Math.min(1, 1 / Math.sqrt(count));
}

// ============================================================================
// Budget Functions
// ============================================================================

/**
 * Set particle budget multipliers programmatically for testing or tuning.
 * @param {number} mul - Budget multiplier (1.0 = default, 0.5 = half, etc.)
 */
export function setParticleBudget(mul) {
  if (typeof mul !== 'number' || !Number.isFinite(mul)) {
    console.warn('[Particles] Invalid budget multiplier:', mul);
    return;
  }
  try {
    if (!window.__PERF_PARTICLES) {
      window.__PERF_PARTICLES = {};
    }
    window.__PERF_PARTICLES.budgetMul = Math.max(0, mul);
    if (window.__PERF_LAB_VERBOSE) {
      console.log('[Particles] Budget multiplier set to:', mul);
    }
  } catch (e) {
    console.warn('[Particles] Failed to set budget multiplier:', e);
  }
}

/**
 * Get current particle budget multiplier.
 * @returns {number} Current budget multiplier (1.0 if not set)
 */
export function getParticleBudgetMultiplier() {
  try {
    return (window.__PERF_PARTICLES && typeof window.__PERF_PARTICLES.budgetMul === 'number')
      ? window.__PERF_PARTICLES.budgetMul
      : 1;
  } catch {
    return 1;
  }
}

/**
 * Reset particle budget to default values.
 */
export function resetParticleBudget() {
  try {
    if (window.__PERF_PARTICLES) {
      window.__PERF_PARTICLES.budgetMul = 1;
    }
    if (window.__PERF_LAB_VERBOSE) {
      console.log('[Particles] Budget reset to default');
    }
  } catch (e) {
    console.warn('[Particles] Failed to reset budget:', e);
  }
}

/**
 * Returns a simple "budget" object that particle systems / toys can use
 * to scale their spawn rates, caps, etc.
 */
export function getParticleBudget() {
  let budget;
  switch (currentQuality) {
    case QUALITY.ULTRA:
      budget = { spawnScale: 1.0, maxCountScale: 1.0 }; break;
    case QUALITY.HIGH:
      budget = { spawnScale: 0.75, maxCountScale: 0.8 }; break; // Less aggressive
    case QUALITY.MEDIUM:
      budget = { spawnScale: 0.55, maxCountScale: 0.6 }; break; // Less aggressive
    case QUALITY.LOW:
    default:
      budget = { spawnScale: 0.35, maxCountScale: 0.4 }; break; // Less aggressive
  }
  
  // Apply toy count normalization factor
  const toyFactor = getToyCountFactor();
  budget.spawnScale *= toyFactor;
  budget.maxCountScale *= toyFactor;
  
  // Apply memory pressure override
  if (memoryPressureLevel >= 2) {
    budget.spawnScale *= 0.7;
    budget.maxCountScale *= 0.7;
  } else if (memoryPressureLevel >= 1) {
    budget.spawnScale *= 0.85;
    budget.maxCountScale *= 0.85;
  }
  
  // PerfLab override: scale budgets for quick A/B testing.
  try {
    const mul = (window.__PERF_PARTICLES && typeof window.__PERF_PARTICLES.budgetMul === 'number')
      ? window.__PERF_PARTICLES.budgetMul
      : 1;
    if (budget && mul !== 1) {
      if (typeof budget.spawnScale === 'number') budget.spawnScale = Math.max(0, budget.spawnScale * mul);
      if (typeof budget.maxCountScale === 'number') budget.maxCountScale = Math.max(0, budget.maxCountScale * mul);
      if (budget.allowField === false) {} else budget.allowField = mul > 0;
    }
  } catch {}
  
  return budget;
}

/**
 * Returns a cross-toy adaptive budget derived from FPS.
 * This is meant to be called by visual toys (drawgrid, loopgrid, etc.) to
 * coordinate throttling instead of each toy inventing its own knobs.
 */
export function getAdaptiveFrameBudget() {
  const baseBudget = getParticleBudget();
  const quality = getParticleQuality();
  
  // Extra attenuation layered on top of the base particle budget.
  // Using additive approach to avoid overly aggressive reduction
  const particleCapScale = (() => {
    switch (quality) {
      case QUALITY.ULTRA: return 1.0;
      case QUALITY.HIGH:  return 0.85; // Less aggressive
      case QUALITY.MEDIUM:return 0.65; // Less aggressive
      case QUALITY.LOW:
      default:            return 0.45; // Less aggressive
    }
  })();
  
  // Keep physics running every frame for responsiveness; rely on smaller caps instead.
  const tickModulo = 1;
  
  const sizeScale = (() => {
    switch (quality) {
      case QUALITY.LOW:     return 0.85;
      case QUALITY.MEDIUM:  return 0.93;
      default:              return 1.0;
    }
  })();
  
  const emergencySample = Math.min(smoothedFps, lastFpsSample);
  const allowField = !(emergencyMode && emergencySample <= EMERGENCY_FIELD_OFF_FPS);
  
  // Skip non-critical redraws on lower tiers for better performance
  const skipNonCriticalEvery = quality === QUALITY.LOW ? 2 : (quality === QUALITY.MEDIUM ? 1 : 1);
  
  return {
    fps: lastFpsSample,
    smoothedFps,
    quality,
    emergencyMode,
    memoryPressureLevel,
    toyCount: activeToyCount,
    particleBudget: {
      ...baseBudget,
      capScale: particleCapScale,
      tickModulo,
      sizeScale,
      allowField,
    },
    renderBudget: {
      skipNonCriticalEvery,
    },
  };
}

/**
 * Get effective budget combining quality settings and optional toy-specific coordination.
 */
export function getEffectiveBudget(toyId = null, options = {}) {
  const budget = getAdaptiveFrameBudget();
  
  // Apply toy-specific coordination if toyId provided
  if (toyId) {
    const coordShare = getCoordinatedBudgetShare(toyId);
    if (coordShare < 1) {
      budget.particleBudget.maxCountScale *= coordShare;
      budget.particleBudget.spawnScale *= coordShare;
    }
  }
  
  return budget;
}

/**
 * Get dynamic particle cap scaled by toy count, quality, and memory pressure.
 * 
 * Uses aggressive per-toy minimum + global cap approach for better scaling
 * at high toy counts. Accounts for per-toy overhead compounding.
 * 
 * @param {number} baseCap - Base particle cap (default: 2200)
 * @returns {number} Scaled particle cap
 */
export function getParticleCap(baseCap = 2200) {
  const budget = getParticleBudget();

  // Start at full quality. Scale down based on global performance signal.
  const autoScale = (getAutoQualityScale?.() ?? 1);
  let cap = Math.floor(baseCap * autoScale);
  cap = Math.floor(cap * (budget.maxCountScale ?? 1));

  // Additional memory pressure reduction (more aggressive than before)
  const memLevel = getMemoryPressureLevel();
  if (memLevel >= 2) {
    cap = Math.floor(cap * 0.5); // 50% reduction for critical memory
  } else if (memLevel >= 1) {
    cap = Math.floor(cap * 0.75); // 25% reduction for warning memory
  }
  
  // Ensure minimum cap for basic functionality
  const globalMinCap = Math.max(150, Math.floor(baseCap * 0.1));
  return Math.max(globalMinCap, cap);
}
import { getAutoQualityScale } from '../../perf/AutoQualityController.js';

const TAP_ORB_FOUNDATION_LITERAL_CONFIRM_BARS = 8;

function normalizeBarIndex(barLike = 0) {
  return Math.max(0, Math.trunc(Number(barLike) || 0));
}

function normalizeStepIndex(stepLike = -1) {
  return Math.max(-1, Math.trunc(Number(stepLike) || -1));
}

function normalizePhase(phaseLike = 'idle') {
  return String(phaseLike || 'idle').trim().toLowerCase() || 'idle';
}

export function createBeatSwarmOnboardingState() {
  const weaponGateMusicRuntime = {
    lowAfterComplete: false,
    startBar: 0,
  };
  const phaseRuntime = {
    phase: 'idle',
    phaseStartBar: 0,
    weaponGateCompleteBar: -1,
    foundationCompleteBar: -1,
  };
  const tapOrbFoundationRuntime = {
    committed: false,
    literalUntilBar: -1,
    carrierRequestReason: '',
    carrierEarliestStep: -1,
  };

  function setPhase(phaseLike = 'idle', barLike = 0) {
    const phase = normalizePhase(phaseLike);
    const bar = normalizeBarIndex(barLike);
    phaseRuntime.phase = phase;
    phaseRuntime.phaseStartBar = bar;
    if (phase === 'tap_orb_foundation') phaseRuntime.weaponGateCompleteBar = bar;
    if (phase === 'foundation_confirm') phaseRuntime.foundationCompleteBar = bar;
    if (phase === 'idle') {
      phaseRuntime.weaponGateCompleteBar = -1;
      phaseRuntime.foundationCompleteBar = -1;
    }
    return phase;
  }

  function reset() {
    setPhase('idle', 0);
    weaponGateMusicRuntime.lowAfterComplete = false;
    weaponGateMusicRuntime.startBar = 0;
    tapOrbFoundationRuntime.committed = false;
    tapOrbFoundationRuntime.literalUntilBar = -1;
    tapOrbFoundationRuntime.carrierRequestReason = '';
    tapOrbFoundationRuntime.carrierEarliestStep = -1;
  }

  function startTapOrbFoundation({ bar = 0, handoffStep = -1, weaponLoopSteps = 1 } = {}) {
    const startBar = normalizeBarIndex(bar);
    const step = normalizeStepIndex(handoffStep);
    const loopSteps = Math.max(1, Math.trunc(Number(weaponLoopSteps) || 1));
    weaponGateMusicRuntime.lowAfterComplete = true;
    weaponGateMusicRuntime.startBar = startBar;
    tapOrbFoundationRuntime.committed = false;
    tapOrbFoundationRuntime.carrierRequestReason = 'weapon_gate_handoff';
    tapOrbFoundationRuntime.carrierEarliestStep = step + (loopSteps * 2);
    return setPhase('tap_orb_foundation', startBar);
  }

  function armLiteralConfirmWindow(startBarLike = 0) {
    const startBar = normalizeBarIndex(startBarLike);
    tapOrbFoundationRuntime.literalUntilBar = startBar + TAP_ORB_FOUNDATION_LITERAL_CONFIRM_BARS;
    return tapOrbFoundationRuntime.literalUntilBar;
  }

  function commitFoundation() {
    tapOrbFoundationRuntime.committed = true;
  }

  function clearCarrierRequest() {
    tapOrbFoundationRuntime.carrierRequestReason = '';
  }

  function isLowGrooveActive() {
    return weaponGateMusicRuntime.lowAfterComplete === true
      && (
        phaseRuntime.phase === 'tap_orb_foundation'
        || phaseRuntime.phase === 'foundation_confirm'
        || phaseRuntime.phase === 'low_groove'
      );
  }

  return {
    weaponGateMusicRuntime,
    phaseRuntime,
    tapOrbFoundationRuntime,
    setPhase,
    reset,
    startTapOrbFoundation,
    armLiteralConfirmWindow,
    commitFoundation,
    clearCarrierRequest,
    isLowGrooveActive,
  };
}

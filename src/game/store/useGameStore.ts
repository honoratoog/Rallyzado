import { create } from 'zustand';
import type {
  CameraMode,
  CarCatalogEntry,
  CheckpointDef,
  GamePhase,
  LiveTelemetry,
  StageRecord,
} from '../types';
import {
  clearSavedCheckpoints,
  loadBestRecord,
  loadSavedCheckpoints,
  saveBestRecord,
  saveCheckpoints,
} from '../data/trackCheckpoints';

/**
 * High-frequency mutable telemetry updated inside the 60fps simulation loop.
 * Avoids React re-renders while giving HUD, Audio, Effects, and Debug Panel zero-lag reads.
 */
export const liveTelemetry: LiveTelemetry = {
  speedKmh: 0,
  speedMs: 0,
  rpm: 1100,
  rpmNormalized: 0.05,
  gear: 1,
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  driftAngleDeg: 0,
  slipIntensity: 0,
  groundedWheels: 4,
  position: [-14.5, 0.5, 120.0],
  yaw: -2.338,
  forward: [-0.71, 0, -0.7],
  wheels: [
    { x: 0, y: 0, z: 0, grounded: true, slip: 0, isRear: false },
    { x: 0, y: 0, z: 0, grounded: true, slip: 0, isRear: false },
    { x: 0, y: 0, z: 0, grounded: true, slip: 0, isRear: true },
    { x: 0, y: 0, z: 0, grounded: true, slip: 0, isRear: true },
  ],
};

/**
 * Shared track ground height sampler populated once the track GLB finishes loading.
 */
export const trackSurfaceSampler: {
  sampleHeight: (x: number, z: number, fallbackY?: number) => number;
  ready: boolean;
} = {
  sampleHeight: (_x, _z, fallbackY = 0) => fallbackY,
  ready: false,
};

interface GameState {
  phase: GamePhase;
  countdownValue: number; // 3, 2, 1, 0 ("GO!")
  stageStartTimestamp: number | null;
  elapsedTimeMs: number;
  lastFinishTimeMs: number | null;
  isNewRecord: boolean;
  record: StageRecord;

  // Checkpoints
  checkpoints: CheckpointDef[];
  nextCheckpointIndex: number; // 1..N-1, then 0 to finish
  passedCount: number;
  lastCheckpointFlash: { name: string; splitMs: number; key: number } | null;

  // Vehicle & Camera
  carCatalog: CarCatalogEntry[];
  selectedCarId: string;
  cameraMode: CameraMode;
  resetCounter: number;
  resetTarget: { x: number; y: number; z: number; yaw: number } | null;

  // Loading & UI toggles
  trackLoaded: boolean;
  carLoaded: boolean;
  muted: boolean;
  debugOpen: boolean;

  // Actions
  setTrackLoaded: (ready: boolean) => void;
  setCarLoaded: (ready: boolean) => void;
  setCarCatalog: (cars: CarCatalogEntry[]) => void;
  selectCar: (carId: string) => void;
  cycleCamera: () => void;
  toggleMute: () => void;
  toggleDebug: () => void;

  startStage: () => void;
  setCountdownValue: (val: number) => void;
  beginRacing: () => void;
  returnToMenu: () => void;
  requestReset: (toStart?: boolean) => void;

  passCheckpoint: (cpIndex: number) => 'checkpoint' | 'finish' | 'ignore';
  setElapsedTimeMs: (ms: number) => void;

  // Calibration actions
  addCheckpointAtCurrentPose: () => void;
  updateCheckpointAtIndex: (index: number, patch: Partial<CheckpointDef>) => void;
  moveCheckpointToCurrentPose: (index: number) => void;
  removeCheckpoint: (index: number) => void;
  persistCheckpoints: () => void;
  resetDefaultCheckpoints: () => void;
}

const CAMERA_ORDER: CameraMode[] = ['chase_far', 'chase_near', 'hood'];

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  countdownValue: 3,
  stageStartTimestamp: null,
  elapsedTimeMs: 0,
  lastFinishTimeMs: null,
  isNewRecord: false,
  record: loadBestRecord(),

  checkpoints: loadSavedCheckpoints(),
  nextCheckpointIndex: 1,
  passedCount: 0,
  lastCheckpointFlash: null,

  carCatalog: [],
  selectedCarId: 'Audi Quattro',
  cameraMode: 'chase_far',
  resetCounter: 0,
  resetTarget: null,

  trackLoaded: false,
  carLoaded: false,
  muted: false,
  debugOpen: false,

  setTrackLoaded: (ready) => set({ trackLoaded: ready }),
  setCarLoaded: (ready) => set({ carLoaded: ready }),

  setCarCatalog: (cars) => {
    const current = get().selectedCarId;
    const exists = cars.some((c) => c.id === current);
    set({
      carCatalog: cars,
      selectedCarId: exists ? current : (cars[0]?.id ?? 'Audi Quattro'),
    });
  },

  selectCar: (carId) => set({ selectedCarId: carId }),

  cycleCamera: () => {
    const current = get().cameraMode;
    const next = CAMERA_ORDER[(CAMERA_ORDER.indexOf(current) + 1) % CAMERA_ORDER.length];
    set({ cameraMode: next });
  },

  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),

  startStage: () => {
    const cps = get().checkpoints;
    const start = cps[0];
    set((s) => ({
      phase: 'countdown',
      countdownValue: 3,
      stageStartTimestamp: null,
      elapsedTimeMs: 0,
      lastFinishTimeMs: null,
      isNewRecord: false,
      nextCheckpointIndex: cps.length > 1 ? 1 : 0,
      passedCount: 0,
      lastCheckpointFlash: null,
      resetTarget: start
        ? { x: start.x, y: start.y, z: start.z, yaw: start.yaw }
        : null,
      resetCounter: s.resetCounter + 1,
    }));
  },

  setCountdownValue: (val) => set({ countdownValue: val }),

  beginRacing: () =>
    set({
      phase: 'racing',
      countdownValue: 0,
      stageStartTimestamp: performance.now(),
      elapsedTimeMs: 0,
    }),

  returnToMenu: () => {
    const start = get().checkpoints[0];
    set((s) => ({
      phase: 'menu',
      countdownValue: 3,
      stageStartTimestamp: null,
      elapsedTimeMs: 0,
      passedCount: 0,
      nextCheckpointIndex: s.checkpoints.length > 1 ? 1 : 0,
      lastCheckpointFlash: null,
      resetTarget: start
        ? { x: start.x, y: start.y, z: start.z, yaw: start.yaw }
        : null,
      resetCounter: s.resetCounter + 1,
    }));
  },

  requestReset: (toStart = false) => {
    const state = get();
    const cps = state.checkpoints;
    let target = cps[0];
    if (!toStart && state.phase === 'racing') {
      // Reset to last passed checkpoint (or start)
      const prevIdx =
        state.passedCount === 0
          ? 0
          : Math.min(state.passedCount, cps.length - 1);
      target = cps[prevIdx] ?? cps[0];
    }
    set((s) => ({
      resetTarget: target
        ? { x: target.x, y: target.y, z: target.z, yaw: target.yaw }
        : null,
      resetCounter: s.resetCounter + 1,
    }));
  },

  passCheckpoint: (cpIndex) => {
    const state = get();
    if (state.phase !== 'racing') return 'ignore';
    if (cpIndex !== state.nextCheckpointIndex) return 'ignore';

    const now = performance.now();
    const elapsed =
      state.stageStartTimestamp !== null ? now - state.stageStartTimestamp : state.elapsedTimeMs;
    const totalCheckpoints = state.checkpoints.length;

    // Crossing index 0 after passing all intermediate checkpoints => Stage Finish!
    if (cpIndex === 0 && state.passedCount >= totalCheckpoints - 1) {
      const prevBest = state.record.bestTimeMs;
      const isNewRecord = prevBest === null || elapsed < prevBest;
      const nextRecord = isNewRecord
        ? saveBestRecord(elapsed, state.selectedCarId)
        : state.record;

      set({
        phase: 'finished',
        elapsedTimeMs: elapsed,
        lastFinishTimeMs: elapsed,
        isNewRecord,
        record: nextRecord,
        passedCount: totalCheckpoints,
        lastCheckpointFlash: {
          name: 'CHEGADA!',
          splitMs: elapsed,
          key: Date.now(),
        },
      });
      return 'finish';
    }

    // Intermediate checkpoint passed
    const newPassed = state.passedCount + 1;
    const nextIdx = newPassed >= totalCheckpoints - 1 ? 0 : cpIndex + 1;
    const cp = state.checkpoints[cpIndex];

    set({
      passedCount: newPassed,
      nextCheckpointIndex: nextIdx,
      elapsedTimeMs: elapsed,
      lastCheckpointFlash: {
        name: cp?.name ?? `CP ${cpIndex}`,
        splitMs: elapsed,
        key: Date.now(),
      },
    });
    return 'checkpoint';
  },

  setElapsedTimeMs: (ms) => set({ elapsedTimeMs: ms }),

  addCheckpointAtCurrentPose: () => {
    const [x, y, z] = liveTelemetry.position;
    const yaw = liveTelemetry.yaw;
    set((s) => {
      const idx = s.checkpoints.length;
      const next: CheckpointDef[] = [
        ...s.checkpoints,
        {
          id: `cp-${idx}-${Date.now().toString(36)}`,
          name: `CP ${idx}`,
          x: Number(x.toFixed(2)),
          y: Number(Math.max(0, y - 0.35).toFixed(2)),
          z: Number(z.toFixed(2)),
          yaw: Number(yaw.toFixed(3)),
          radius: 14,
        },
      ];
      return { checkpoints: next };
    });
  },

  updateCheckpointAtIndex: (index, patch) => {
    set((s) => ({
      checkpoints: s.checkpoints.map((cp, i) =>
        i === index ? { ...cp, ...patch } : cp,
      ),
    }));
  },

  moveCheckpointToCurrentPose: (index) => {
    const [x, y, z] = liveTelemetry.position;
    const yaw = liveTelemetry.yaw;
    set((s) => ({
      checkpoints: s.checkpoints.map((cp, i) =>
        i === index
          ? {
              ...cp,
              x: Number(x.toFixed(2)),
              y: Number(Math.max(0, y - 0.35).toFixed(2)),
              z: Number(z.toFixed(2)),
              yaw: Number(yaw.toFixed(3)),
            }
          : cp,
      ),
    }));
  },

  removeCheckpoint: (index) => {
    if (index === 0) return; // keep start/finish
    set((s) => {
      const next = s.checkpoints.filter((_, i) => i !== index);
      return {
        checkpoints: next,
        nextCheckpointIndex: Math.min(s.nextCheckpointIndex, Math.max(0, next.length - 1)),
      };
    });
  },

  persistCheckpoints: () => {
    saveCheckpoints(get().checkpoints);
  },

  resetDefaultCheckpoints: () => {
    const defaults = clearSavedCheckpoints();
    set({
      checkpoints: defaults,
      nextCheckpointIndex: 1,
      passedCount: 0,
    });
  },
}));

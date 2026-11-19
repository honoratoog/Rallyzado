import type { CheckpointDef, StageRecord } from '../types';

export const CHECKPOINTS_STORAGE_KEY = 'rallyzado_custom_checkpoints_v1';
export const BEST_TIME_STORAGE_KEY = 'rallyzado_best_time_v1';

/**
 * Verified centerline coordinates extracted from public/models/drift_race_track_free.glb.
 * Index 0 is the Start/Finish line & default vehicle spawn pose.
 * Checkpoints 1..N are passed in sequence before crossing Index 0 again to finish the stage.
 */
export const DEFAULT_CHECKPOINTS: CheckpointDef[] = [
  {
    id: 'start',
    name: 'LARGADA / CHEGADA',
    x: -14.5,
    y: 0,
    z: 120.0,
    yaw: -2.338,
    radius: 13.5,
  },
  {
    id: 'cp-1',
    name: 'CP 1 - Reta Diagonal',
    x: -72.0,
    y: 0,
    z: 64.5,
    yaw: -2.323,
    radius: 13.5,
  },
  {
    id: 'cp-2',
    name: 'CP 2 - Curva Oeste',
    x: -126.5,
    y: 0,
    z: 13.5,
    yaw: -2.795,
    radius: 14.0,
  },
  {
    id: 'cp-3',
    name: 'CP 3 - Reta Oeste',
    x: -146.0,
    y: 0,
    z: -40.5,
    yaw: 2.75,
    radius: 14.0,
  },
  {
    id: 'cp-4',
    name: 'CP 4 - Entrada Norte',
    x: -121.0,
    y: 0,
    z: -101.0,
    yaw: 1.836,
    radius: 14.0,
  },
  {
    id: 'cp-5',
    name: 'CP 5 - Crista Norte',
    x: -56.5,
    y: 0,
    z: -118.5,
    yaw: 1.247,
    radius: 14.0,
  },
  {
    id: 'cp-6',
    name: 'CP 6 - Curva Nordeste',
    x: 16.5,
    y: 0,
    z: -94.0,
    yaw: 0.873,
    radius: 14.0,
  },
  {
    id: 'cp-7',
    name: 'CP 7 - Cotovelo Leste',
    x: 72.5,
    y: 0,
    z: -47.0,
    yaw: -1.065,
    radius: 15.5,
  },
  {
    id: 'cp-8',
    name: 'CP 8 - Entrada Miolo',
    x: 7.5,
    y: 0,
    z: -11.0,
    yaw: -2.217,
    radius: 14.5,
  },
  {
    id: 'cp-9',
    name: 'CP 9 - Arena Drift',
    x: -62.0,
    y: 0,
    z: -66.0,
    yaw: -2.9,
    radius: 17.5,
  },
  {
    id: 'cp-10',
    name: 'CP 10 - Saída Miolo',
    x: -72.0,
    y: 0,
    z: -18.0,
    yaw: 0.65,
    radius: 16.0,
  },
  {
    id: 'cp-11',
    name: 'CP 11 - Diagonal Interna',
    x: -36.5,
    y: 0,
    z: 51.0,
    yaw: 0.773,
    radius: 14.0,
  },
  {
    id: 'cp-12',
    name: 'CP 12 - Curva Sudeste',
    x: 30.0,
    y: 0,
    z: 100.0,
    yaw: 0.45,
    radius: 16.0,
  },
  {
    id: 'cp-13',
    name: 'CP 13 - Hairpin Sul',
    x: 40.0,
    y: 0,
    z: 162.0,
    yaw: -2.15,
    radius: 17.0,
  },
];

export function loadSavedCheckpoints(): CheckpointDef[] {
  try {
    const raw = localStorage.getItem(CHECKPOINTS_STORAGE_KEY);
    if (!raw) return DEFAULT_CHECKPOINTS.map((c) => ({ ...c }));
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_CHECKPOINTS.map((c) => ({ ...c }));
}

export function saveCheckpoints(checkpoints: CheckpointDef[]): void {
  try {
    localStorage.setItem(CHECKPOINTS_STORAGE_KEY, JSON.stringify(checkpoints));
  } catch {
    // ignore storage errors
  }
}

export function clearSavedCheckpoints(): CheckpointDef[] {
  try {
    localStorage.removeItem(CHECKPOINTS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return DEFAULT_CHECKPOINTS.map((c) => ({ ...c }));
}

export function loadBestRecord(): StageRecord {
  try {
    const raw = localStorage.getItem(BEST_TIME_STORAGE_KEY);
    if (!raw) return { bestTimeMs: null, bestCarId: null, bestDate: null };
    const parsed = JSON.parse(raw) as StageRecord;
    return {
      bestTimeMs: typeof parsed.bestTimeMs === 'number' ? parsed.bestTimeMs : null,
      bestCarId: parsed.bestCarId ?? null,
      bestDate: parsed.bestDate ?? null,
    };
  } catch {
    return { bestTimeMs: null, bestCarId: null, bestDate: null };
  }
}

export function saveBestRecord(timeMs: number, carId: string): StageRecord {
  const rec: StageRecord = {
    bestTimeMs: timeMs,
    bestCarId: carId,
    bestDate: new Date().toISOString(),
  };
  try {
    localStorage.setItem(BEST_TIME_STORAGE_KEY, JSON.stringify(rec));
  } catch {
    // ignore
  }
  return rec;
}

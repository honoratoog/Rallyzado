export type GamePhase = 'menu' | 'countdown' | 'racing' | 'finished';

export type CameraMode = 'chase_far' | 'chase_near' | 'hood';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CheckpointDef {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number; // radians, +Z forward
  radius: number;
}

export interface CarCatalogEntry {
  id: string;
  name: string;
  era: string;
  bodyNodeName: string;
  meshNames: string[];
  wheelNodeNames: string[];
  center: [number, number, number];
  length: number;
}

export interface WheelContactSample {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  slip: number;
  isRear: boolean;
}

export interface LiveTelemetry {
  speedKmh: number;
  speedMs: number;
  rpm: number; // 900 - 8200
  rpmNormalized: number; // 0 - 1
  gear: number; // -1 = R, 0 = N, 1..6
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  driftAngleDeg: number;
  slipIntensity: number; // 0..1
  groundedWheels: number;
  position: [number, number, number];
  yaw: number;
  forward: [number, number, number];
  wheels: [
    WheelContactSample,
    WheelContactSample,
    WheelContactSample,
    WheelContactSample,
  ];
}

export interface StageRecord {
  bestTimeMs: number | null;
  bestCarId: string | null;
  bestDate: string | null;
}

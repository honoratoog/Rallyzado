/**
 * Arcade-Sim AWD Rally vehicle physics parameters.
 * Tuned for responsive keyboard play, controllable handbrake powerslides,
 * visible chassis weight transfer, and snappy corner-exit acceleration.
 */
export const VEHICLE_TUNING = {
  // Chassis mass & dimensions
  mass: 1280, // kg (classic Group B / WRC rally car weight)
  colliderHalfExtents: [0.84, 0.42, 1.98] as [number, number, number],
  colliderCenterY: 0.62,

  // 4-wheel raycast suspension
  suspensionRestLength: 0.42,
  suspensionTravel: 0.24,
  suspensionStiffness: 42000, // N/m per wheel
  suspensionDamping: 4600, // N·s/m per wheel
  maxSuspensionForce: 28000,

  // AWD powertrain
  maxDriveForce: 15800, // strong rally launch & mid-range pull
  maxReverseForce: 8500,
  brakeForce: 22000,
  maxForwardSpeedMs: 56.5, // ~203 km/h top speed
  maxReverseSpeedMs: 14.5, // ~52 km/h reverse
  awdFrontBias: 0.44, // 44% front / 56% rear rally AWD split
  aeroDrag: 0.42,
  rollingResistance: 115,

  // Steering & Drift Dynamics
  maxSteerAngle: 0.56, // ~32 deg low speed
  highSpeedSteerFactor: 0.42, // tighter steering authority at high speed
  steerResponseSpeed: 7.5,
  steerReturnSpeed: 10.5,

  // Lateral grip & handbrake drift
  frontLateralGrip: 11.8,
  rearLateralGrip: 10.2,
  handbrakeRearGrip: 2.35, // rear breaks loose cleanly on Space
  handbrakeBrakeForce: 7200,
  driftYawAssist: 3.1, // helps kick tail out on handbrake + steer
  counterSteerStability: 2.1, // natural rally self-stabilizing counter-steer feel
  angularDampingYaw: 2.6,

  // Visual body weight transfer (radians)
  maxPitchAngle: 0.068,
  maxRollAngle: 0.095,
} as const;

export interface GearboxSample {
  gear: number; // -1 = R, 0 = N, 1..6
  rpm: number; // 950..8200
  rpmNormalized: number; // 0..1
}

/** Speed thresholds (km/h) for 6-speed close-ratio rally gearbox */
const GEAR_SPEED_RANGES: [number, number][] = [
  [0, 52], // 1st
  [36, 88], // 2nd
  [70, 124], // 3rd
  [104, 156], // 4th
  [136, 184], // 5th
  [164, 212], // 6th
];

export function computeGearbox(
  forwardSpeedMs: number,
  throttle: number,
  slipIntensity: number,
  isCountdownRev: boolean,
): GearboxSample {
  if (isCountdownRev) {
    const revRpm = 1150 + throttle * 5600 + (throttle > 0.8 ? Math.sin(performance.now() * 0.06) * 240 : 0);
    return {
      gear: 1,
      rpm: revRpm,
      rpmNormalized: Math.max(0, Math.min(1, (revRpm - 950) / (8000 - 950))),
    };
  }

  const speedKmh = forwardSpeedMs * 3.6;

  if (speedKmh < -1.5) {
    const revRatio = Math.min(1, Math.abs(speedKmh) / 50);
    const rpm = 1200 + revRatio * 5400 + throttle * 600;
    return {
      gear: -1,
      rpm,
      rpmNormalized: Math.max(0, Math.min(1, (rpm - 950) / (8000 - 950))),
    };
  }

  if (Math.abs(speedKmh) < 1.2 && throttle < 0.05) {
    return { gear: 1, rpm: 1050, rpmNormalized: 0.02 };
  }

  // Pick gear based on speed
  let gear = 1;
  for (let i = 0; i < GEAR_SPEED_RANGES.length; i++) {
    const [, maxSpd] = GEAR_SPEED_RANGES[i];
    if (speedKmh <= maxSpd - 3 || i === GEAR_SPEED_RANGES.length - 1) {
      gear = i + 1;
      break;
    }
  }

  const [minSpd, maxSpd] = GEAR_SPEED_RANGES[gear - 1];
  const progress = Math.max(0, Math.min(1.06, (speedKmh - minSpd) / Math.max(1, maxSpd - minSpd)));
  const wheelSpinBoost = slipIntensity * throttle * 1100;
  const loadBoost = throttle * 650;
  const rawRpm = 2400 + progress * 5350 + wheelSpinBoost + loadBoost;
  const rpm = Math.max(1050, Math.min(8200, gear === 1 ? Math.max(1150 + throttle * 2400, rawRpm * 0.95) : rawRpm));

  return {
    gear,
    rpm,
    rpmNormalized: Math.max(0, Math.min(1, (rpm - 950) / (8000 - 950))),
  };
}

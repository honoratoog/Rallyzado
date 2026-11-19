import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CuboidCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import {
  buildNormalizedCar,
  extractCarCatalog,
  type NormalizedCarRig,
  type NormalizedWheelRig,
} from '../utils/glbNormalization';
import {
  liveTelemetry,
  trackSurfaceSampler,
  useGameStore,
} from '../store/useGameStore';
import { computeGearbox, VEHICLE_TUNING } from './vehicleTuning';
import { rallyAudio } from '../audio/RallyAudioEngine';

export const CAR_MODEL_URL = '/models/1965-2002_rally_cars.glb';

interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

// Reusable scratch math objects (zero allocations inside 60fps loop)
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _vel = new THREE.Vector3();
const _angVel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _left = new THREE.Vector3();
const _up = new THREE.Vector3();
const _down = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _wheelLocal = new THREE.Vector3();
const _worldPoint = new THREE.Vector3();
const _pointVel = new THREE.Vector3();
const _relPoint = new THREE.Vector3();
const _force = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _smoothCamPos = new THREE.Vector3();
const _smoothCamLook = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export function RallyVehicle() {
  const gltf = useGLTF(CAR_MODEL_URL);
  const { rapier, world } = useRapier();
  const { camera } = useThree();

  const bodyRef = useRef<RapierRigidBody | null>(null);
  const inputRef = useRef<InputState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
  });

  // Dynamic simulation state stored in refs
  const steerAngleRef = useRef(0);
  const wheelSpinRef = useRef(0);
  const rearSpinRef = useRef(0);
  const prevForwardSpeedRef = useRef(0);
  const smoothPitchRef = useRef(0);
  const smoothRollRef = useRef(0);
  const orbitAngleRef = useRef(0.6);
  const camInitializedRef = useRef(false);
  const lastImpactTimeRef = useRef(0);
  const prevSpeedMsRef = useRef(0);

  const selectedCarId = useGameStore((s) => s.selectedCarId);
  const setCarCatalog = useGameStore((s) => s.setCarCatalog);
  const setCarLoaded = useGameStore((s) => s.setCarLoaded);
  const trackLoaded = useGameStore((s) => s.trackLoaded);
  const resetCounter = useGameStore((s) => s.resetCounter);

  // Extract all cars from the GLB pack once
  const catalog = useMemo(() => extractCarCatalog(gltf.scene), [gltf.scene]);

  useEffect(() => {
    setCarCatalog(catalog);
    setCarLoaded(true);
  }, [catalog, setCarCatalog, setCarLoaded]);

  // Build normalized 4.2m rig for the selected car
  const carRig: NormalizedCarRig | null = useMemo(() => {
    if (catalog.length === 0) return null;
    const entry = catalog.find((c) => c.id === selectedCarId) ?? catalog[0];
    return buildNormalizedCar(gltf.scene, entry, 4.2);
  }, [gltf.scene, catalog, selectedCarId]);

  // Clean up cloned car geometries/materials on switch/unmount
  useEffect(() => {
    return () => {
      if (!carRig) return;
      carRig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    };
  }, [carRig]);

  // Spawn / Reset helper using exact vertical raycast ground sampling
  const teleportToPose = (x: number, z: number, yaw: number, fallbackY = 0) => {
    const rb = bodyRef.current;
    if (!rb) return;

    // 1) Try Rapier raycast first for exact physics mesh alignment
    let groundY = trackSurfaceSampler.sampleHeight(x, z, fallbackY);
    const ray = new rapier.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, 120, true, undefined, undefined, undefined, rb);
    if (hit) {
      groundY = 60 - hit.timeOfImpact;
    }

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    rb.setTranslation({ x, y: groundY + 0.06, z }, true);
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);

    steerAngleRef.current = 0;
    smoothPitchRef.current = 0;
    smoothRollRef.current = 0;
    prevForwardSpeedRef.current = 0;
    prevSpeedMsRef.current = 0;
    camInitializedRef.current = false;

    liveTelemetry.position = [x, groundY + 0.06, z];
    liveTelemetry.yaw = yaw;
    liveTelemetry.speedKmh = 0;
    liveTelemetry.speedMs = 0;
    liveTelemetry.driftAngleDeg = 0;
    liveTelemetry.slipIntensity = 0;
  };

  // Initial spawn once track + vehicle are ready, and on every reset request
  useEffect(() => {
    if (!trackLoaded) return;
    const state = useGameStore.getState();
    const target = state.resetTarget ?? state.checkpoints[0];
    if (!target) return;
    // Slight defer ensures Rapier fixed trimesh colliders are stepped into the world
    const id = requestAnimationFrame(() => {
      teleportToPose(target.x, target.z, target.yaw, target.y);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackLoaded, resetCounter]);

  // Global keyboard bindings
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const code = e.code;
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      // Initialize Web Audio seamlessly on first user key press
      rallyAudio.init();

      if (code === 'KeyW' || code === 'ArrowUp') inputRef.current.forward = true;
      if (code === 'KeyS' || code === 'ArrowDown') inputRef.current.backward = true;
      if (code === 'KeyA' || code === 'ArrowLeft') inputRef.current.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') inputRef.current.right = true;
      if (code === 'Space') inputRef.current.handbrake = true;

      if (!e.repeat) {
        if (code === 'KeyC') {
          useGameStore.getState().cycleCamera();
        } else if (code === 'KeyR') {
          const st = useGameStore.getState();
          if (st.phase === 'racing' || st.phase === 'finished') {
            st.requestReset(false);
          }
        } else if (code === 'KeyH') {
          useGameStore.getState().toggleDebug();
        } else if (code === 'KeyM') {
          const st = useGameStore.getState();
          st.toggleMute();
          rallyAudio.setMuted(!st.muted);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') inputRef.current.forward = false;
      if (code === 'KeyS' || code === 'ArrowDown') inputRef.current.backward = false;
      if (code === 'KeyA' || code === 'ArrowLeft') inputRef.current.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') inputRef.current.right = false;
      if (code === 'Space') inputRef.current.handbrake = false;
    };

    const onBlur = () => {
      inputRef.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        handbrake: false,
      };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Main 60Hz rally physics, wheel animation, checkpoint detection, camera & audio update
  useFrame((_state, rawDelta) => {
    const rb = bodyRef.current;
    if (!rb || !carRig) return;

    const dt = Math.min(rawDelta, 0.05);
    const store = useGameStore.getState();
    const { phase, cameraMode, checkpoints, nextCheckpointIndex, muted } = store;

    rallyAudio.setMuted(muted);

    // Read body transform & velocity
    const t = rb.translation();
    const r = rb.rotation();
    const lv = rb.linvel();
    const av = rb.angvel();

    _pos.set(t.x, t.y, t.z);
    _quat.set(r.x, r.y, r.z, r.w);
    _vel.set(lv.x, lv.y, lv.z);
    _angVel.set(av.x, av.y, av.z);

    // Basis vectors in world space (+Z forward, +X left, +Y up)
    _forward.set(0, 0, 1).applyQuaternion(_quat).normalize();
    _left.set(1, 0, 0).applyQuaternion(_quat).normalize();
    _up.set(0, 1, 0).applyQuaternion(_quat).normalize();
    _down.copy(_up).negate();

    const forwardSpeed = _vel.dot(_forward);
    const lateralSpeed = _vel.dot(_left);
    const horizSpeed = Math.hypot(forwardSpeed, lateralSpeed);
    const speedKmh = Math.abs(forwardSpeed) * 3.6;

    // Impact audio detection on sudden velocity drop (guardrail hits)
    const speedDrop = prevSpeedMsRef.current - horizSpeed;
    if (phase === 'racing' && speedDrop > 6.5 && performance.now() - lastImpactTimeRef.current > 320) {
      lastImpactTimeRef.current = performance.now();
      rallyAudio.playImpact(Math.min(1, speedDrop / 20));
    }
    prevSpeedMsRef.current = horizSpeed;

    // Inputs (locked during menu & countdown, revving allowed in countdown!)
    const inp = inputRef.current;
    const canDrive = phase === 'racing';
    const throttleInput = inp.forward ? 1 : 0;
    const brakeInput = inp.backward ? 1 : 0;
    const rawSteer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const handbrake = canDrive && inp.handbrake;

    // Speed-sensitive steering with smooth return
    const speedNorm = Math.min(1, horizSpeed / VEHICLE_TUNING.maxForwardSpeedMs);
    const maxSteer =
      VEHICLE_TUNING.maxSteerAngle *
      (1 - speedNorm * (1 - VEHICLE_TUNING.highSpeedSteerFactor));
    const targetSteer = canDrive ? rawSteer * maxSteer : 0;
    const steerLerpRate =
      Math.abs(rawSteer) > 0.01
        ? VEHICLE_TUNING.steerResponseSpeed
        : VEHICLE_TUNING.steerReturnSpeed;
    steerAngleRef.current += (targetSteer - steerAngleRef.current) * Math.min(1, steerLerpRate * dt);
    const steerAngle = steerAngleRef.current;

    // --- 1. FOUR-WHEEL RAYCAST SUSPENSION ---
    const actualMass = rb.mass() > 1 ? rb.mass() : VEHICLE_TUNING.mass;
    const halfTrack = carRig.trackWidth * 0.5;
    const halfWB = carRig.wheelBase * 0.5;
    const wheelRadius = carRig.wheelRadius;
    const rayOriginY = wheelRadius + 0.45;
    const springK = 28000;
    const springDamp = 4200;
    const restCompression = (actualMass * 9.81 * 0.25) / springK; // exact equilibrium at y = groundY
    const maxRayLen = rayOriginY + restCompression;

    const wheelSpecs: {
      rig: NormalizedWheelRig | null;
      lx: number;
      lz: number;
      isFront: boolean;
    }[] = [
      { rig: carRig.wheels.fl, lx: halfTrack, lz: halfWB, isFront: true },
      { rig: carRig.wheels.fr, lx: -halfTrack, lz: halfWB, isFront: true },
      { rig: carRig.wheels.rl, lx: halfTrack, lz: -halfWB, isFront: false },
      { rig: carRig.wheels.rr, lx: -halfTrack, lz: -halfWB, isFront: false },
    ];

    let groundedWheels = 0;

    for (let i = 0; i < 4; i++) {
      const ws = wheelSpecs[i];
      _wheelLocal.set(ws.lx, rayOriginY, ws.lz);
      _rayOrigin.copy(_wheelLocal).applyQuaternion(_quat).add(_pos);

      const ray = new rapier.Ray(
        { x: _rayOrigin.x, y: _rayOrigin.y, z: _rayOrigin.z },
        { x: _down.x, y: _down.y, z: _down.z },
      );
      const hit = world.castRay(ray, maxRayLen, true, undefined, undefined, undefined, rb);

      const sample = liveTelemetry.wheels[i];
      sample.isRear = !ws.isFront;

      if (hit && hit.timeOfImpact <= maxRayLen) {
        groundedWheels++;
        const compression = Math.max(0, maxRayLen - hit.timeOfImpact);

        // Compute contact point & vertical point velocity for damping
        _worldPoint.copy(_rayOrigin).addScaledVector(_down, hit.timeOfImpact);
        _relPoint.copy(_worldPoint).sub(_pos);
        _pointVel.crossVectors(_angVel, _relPoint).add(_vel);
        const verticalVel = _pointVel.dot(_up);

        const suspForce = Math.max(
          0,
          Math.min(
            VEHICLE_TUNING.maxSuspensionForce,
            compression * springK - verticalVel * springDamp,
          ),
        );

        _force.copy(_up).multiplyScalar(suspForce * dt);
        rb.applyImpulseAtPoint(
          { x: _force.x, y: _force.y, z: _force.z },
          { x: _worldPoint.x, y: _worldPoint.y, z: _worldPoint.z },
          true,
        );

        sample.grounded = true;
        sample.x = _worldPoint.x;
        sample.y = _worldPoint.y;
        sample.z = _worldPoint.z;

        // Visual wheel travel (keep within realistic strut range so wheels stay clear of fenders)
        if (ws.rig) {
          const travelOffset = Math.max(
            -0.08,
            Math.min(0.08, compression - restCompression),
          );
          ws.rig.mount.position.y = ws.rig.restPosition.y + travelOffset;
        }
      } else {
        sample.grounded = false;
        if (ws.rig) {
          ws.rig.mount.position.y = THREE.MathUtils.lerp(
            ws.rig.mount.position.y,
            ws.rig.restPosition.y - 0.08,
            Math.min(1, dt * 12),
          );
        }
      }
    }

    // --- 2. AWD RALLY TRACTION, STEERING & HANDBRAKE DRIFT ---
    let slipIntensity = 0;
    let driftAngleDeg = 0;

    if (groundedWheels > 0) {
      const gripScale = groundedWheels / 4;
      const mass = VEHICLE_TUNING.mass;

      // Project forward & left horizontally so slopes/pitch stay clean
      const horizForward = _forward.clone().setY(0).normalize();
      const horizLeft = _left.clone().setY(0).normalize();
      const yawRate = _angVel.y;

      let longForce = 0;

      if (canDrive) {
        // Throttle & Reverse / Braking
        if (throttleInput > 0) {
          if (forwardSpeed < -1.0) {
            longForce += VEHICLE_TUNING.brakeForce;
          } else {
            // Punchy low/mid-end AWD torque curve tapering gently near top speed
            const speedRatio = Math.max(0, forwardSpeed / VEHICLE_TUNING.maxForwardSpeedMs);
            const torqueCurve = Math.max(0, 1.15 - speedRatio * 0.95);
            longForce += VEHICLE_TUNING.maxDriveForce * torqueCurve * throttleInput;
          }
        }

        if (brakeInput > 0) {
          if (forwardSpeed > 1.2) {
            longForce -= VEHICLE_TUNING.brakeForce * brakeInput;
          } else if (forwardSpeed > -VEHICLE_TUNING.maxReverseSpeedMs) {
            longForce -= VEHICLE_TUNING.maxReverseForce * brakeInput;
          }
        }

        if (handbrake) {
          // Handbrake slows slightly while keeping speed alive for sweeping powerslides
          longForce -= Math.sign(forwardSpeed) * VEHICLE_TUNING.handbrakeBrakeForce;
        }
      } else {
        // Hold firmly at start line during menu / countdown
        longForce = -forwardSpeed * mass * 8.0;
      }

      // Aerodynamic drag + rolling resistance
      longForce -= forwardSpeed * Math.abs(forwardSpeed) * VEHICLE_TUNING.aeroDrag * 6.5;
      longForce -= forwardSpeed * VEHICLE_TUNING.rollingResistance;

      // Bicycle/4-wheel lateral velocity at front & rear axles
      const vLatFront = lateralSpeed + yawRate * halfWB;
      const vLatRear = lateralSpeed - yawRate * halfWB;

      // Steer rotation projects forward speed into front-axle lateral slip!
      const frontSteerLatSlip = vLatFront - Math.sin(steerAngle) * forwardSpeed * 1.18;

      // Rear lateral grip drops sharply on handbrake and slightly under full-throttle rally oversteer
      const baseRearGrip = handbrake
        ? VEHICLE_TUNING.handbrakeRearGrip
        : VEHICLE_TUNING.rearLateralGrip * (1 - throttleInput * Math.abs(steerAngle) * 0.28);

      const frontLatAccel = THREE.MathUtils.clamp(
        -frontSteerLatSlip * VEHICLE_TUNING.frontLateralGrip,
        -26,
        26,
      );
      const rearLatAccel = THREE.MathUtils.clamp(
        -vLatRear * baseRearGrip,
        handbrake ? -9 : -24,
        handbrake ? 9 : 24,
      );

      const totalLatForce = (frontLatAccel * 0.52 + rearLatAccel * 0.48) * mass * gripScale;

      // Apply longitudinal & lateral impulses at center of mass
      _force
        .copy(horizForward)
        .multiplyScalar(longForce * gripScale * dt)
        .addScaledVector(horizLeft, totalLatForce * dt);
      rb.applyImpulse({ x: _force.x, y: 0, z: _force.z }, true);

      // Yaw torque from front/rear lateral balance + rally handbrake kick + counter-steer damping
      let yawMoment =
        (frontLatAccel * halfWB * 0.55 - rearLatAccel * halfWB * 0.48) * mass * 0.55;

      // Handbrake tail kick when turning at speed
      if (handbrake && horizSpeed > 6 && Math.abs(steerAngle) > 0.05) {
        yawMoment +=
          Math.sign(steerAngle) *
          Math.min(1, horizSpeed / 22) *
          VEHICLE_TUNING.driftYawAssist *
          mass *
          1.4;
      }

      // Gentle steering turn-in assist at low/medium speeds so keyboard feels crisp
      if (canDrive && Math.abs(forwardSpeed) > 0.8) {
        const dirSign = forwardSpeed >= 0 ? 1 : -1;
        const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 14);
        yawMoment +=
          steerAngle * dirSign * speedFactor * mass * (handbrake ? 5.6 : 4.2);
      }

      // Natural angular damping & counter-steer stability
      const yawDamp = canDrive
        ? VEHICLE_TUNING.angularDampingYaw * (handbrake ? 0.52 : 1.0)
        : 9.0;
      yawMoment -= yawRate * mass * yawDamp;

      rb.applyTorqueImpulse({ x: 0, y: yawMoment * gripScale * dt, z: 0 }, true);

      // Compute drift angle & slip intensity for audio + smoke/skidmarks
      if (horizSpeed > 3.0) {
        driftAngleDeg = THREE.MathUtils.radToDeg(
          Math.atan2(Math.abs(lateralSpeed), Math.max(1.5, Math.abs(forwardSpeed))),
        );
      }

      const latSlipNorm = Math.min(1, Math.abs(lateralSpeed) / 10.5);
      const launchSlip =
        canDrive && throttleInput > 0.8 && speedKmh < 42 ? 0.42 : 0;
      const brakeLockSlip = canDrive && brakeInput > 0.8 && speedKmh > 35 ? 0.48 : 0;
      slipIntensity = Math.min(
        1,
        Math.max(
          latSlipNorm * (handbrake ? 1.35 : 1.0),
          handbrake && horizSpeed > 4 ? 0.88 : 0,
          launchSlip,
          brakeLockSlip,
        ),
      );

      // Stamp per-wheel slip for skidmarks & gravel dust
      for (let i = 0; i < 4; i++) {
        const s = liveTelemetry.wheels[i];
        s.slip = s.grounded
          ? s.isRear
            ? slipIntensity
            : Math.max(0, slipIntensity * 0.55 - 0.15)
          : 0;
      }
    } else {
      for (let i = 0; i < 4; i++) liveTelemetry.wheels[i].slip = 0;
    }

    // --- 3. ANTI-ROLL / SELF-RIGHTING STABILITY ---
    // Keeps rally car planted through high-speed drifts and curbs without awkward barrel rolls
    const uprightCross = _torque.crossVectors(_up, new THREE.Vector3(0, 1, 0));
    rb.applyTorqueImpulse(
      {
        x: (uprightCross.x * 8500 - _angVel.x * 2600) * dt,
        y: 0,
        z: (uprightCross.z * 8500 - _angVel.z * 2600) * dt,
      },
      true,
    );

    // Prevent drifting away horizontally during menu or countdown without wiping vertical suspension velocity!
    if (!canDrive && horizSpeed < 1.0) {
      const curLv = rb.linvel();
      const curAv = rb.angvel();
      rb.setLinvel({ x: curLv.x * 0.78, y: curLv.y, z: curLv.z * 0.78 }, true);
      rb.setAngvel({ x: curAv.x * 0.8, y: curAv.y * 0.65, z: curAv.z * 0.8 }, true);
    }

    // --- 4. VISUAL CHASSIS WEIGHT TRANSFER & WHEEL ANIMATIONS ---
    const longAccel = (forwardSpeed - prevForwardSpeedRef.current) / Math.max(dt, 0.008);
    prevForwardSpeedRef.current = forwardSpeed;

    // Positive X rotation = nose dive (braking); negative = squat (acceleration)
    const targetPitch = THREE.MathUtils.clamp(
      -longAccel * 0.0042 + (handbrake ? 0.025 : 0),
      -VEHICLE_TUNING.maxPitchAngle,
      VEHICLE_TUNING.maxPitchAngle,
    );
    // Turning left (+steer) => body leans outward to right (+Z rotation)
    const latG = (lateralSpeed * 0.35 + steerAngle * Math.min(24, Math.abs(forwardSpeed)) * 0.18);
    const targetRoll = THREE.MathUtils.clamp(
      latG * 0.018,
      -VEHICLE_TUNING.maxRollAngle,
      VEHICLE_TUNING.maxRollAngle,
    );

    smoothPitchRef.current += (targetPitch - smoothPitchRef.current) * Math.min(1, dt * 9);
    smoothRollRef.current += (targetRoll - smoothRollRef.current) * Math.min(1, dt * 9);

    carRig.chassisGroup.rotation.x = smoothPitchRef.current;
    carRig.chassisGroup.rotation.z = smoothRollRef.current;

    // Animate wheel spin & front steering
    const frontOmega = forwardSpeed / Math.max(0.2, wheelRadius);
    const rearOmega = handbrake ? 0 : frontOmega * (1 + throttleInput * slipIntensity * 0.35);
    wheelSpinRef.current += frontOmega * dt;
    rearSpinRef.current += rearOmega * dt;

    if (carRig.wheels.fl) {
      carRig.wheels.fl.steerPivot.rotation.y = steerAngle;
      carRig.wheels.fl.spinPivot.rotation.x = wheelSpinRef.current;
    }
    if (carRig.wheels.fr) {
      carRig.wheels.fr.steerPivot.rotation.y = steerAngle;
      carRig.wheels.fr.spinPivot.rotation.x = wheelSpinRef.current;
    }
    if (carRig.wheels.rl) {
      carRig.wheels.rl.spinPivot.rotation.x = rearSpinRef.current;
    }
    if (carRig.wheels.rr) {
      carRig.wheels.rr.spinPivot.rotation.x = rearSpinRef.current;
    }

    // --- 5. GEARBOX, TELEMETRY & AUDIO ---
    const isCountdownRev = phase === 'countdown';
    const gearbox = computeGearbox(
      forwardSpeed,
      canDrive || isCountdownRev ? throttleInput : 0,
      slipIntensity,
      isCountdownRev,
    );

    _euler.setFromQuaternion(_quat, 'YXZ');

    liveTelemetry.speedKmh = speedKmh;
    liveTelemetry.speedMs = horizSpeed;
    liveTelemetry.rpm = gearbox.rpm;
    liveTelemetry.rpmNormalized = gearbox.rpmNormalized;
    liveTelemetry.gear = gearbox.gear;
    liveTelemetry.throttle = canDrive || isCountdownRev ? throttleInput : 0;
    liveTelemetry.brake = canDrive ? brakeInput : 0;
    liveTelemetry.steer = steerAngle;
    liveTelemetry.handbrake = handbrake;
    liveTelemetry.driftAngleDeg = driftAngleDeg;
    liveTelemetry.slipIntensity = slipIntensity;
    liveTelemetry.groundedWheels = groundedWheels;
    liveTelemetry.position = [_pos.x, _pos.y, _pos.z];
    liveTelemetry.yaw = _euler.y;
    liveTelemetry.forward = [_forward.x, _forward.y, _forward.z];

    rallyAudio.updateTelemetry({
      rpmNormalized: gearbox.rpmNormalized,
      throttle: liveTelemetry.throttle,
      slipIntensity,
      speedKmh,
      active: phase === 'racing' || phase === 'countdown',
    });

    // --- 6. CHECKPOINT & STAGE TIMER ---
    if (phase === 'racing') {
      const targetCp = checkpoints[nextCheckpointIndex];
      if (targetCp) {
        const dist = Math.hypot(_pos.x - targetCp.x, _pos.z - targetCp.z);
        if (dist <= targetCp.radius) {
          const outcome = store.passCheckpoint(nextCheckpointIndex);
          if (outcome === 'checkpoint') {
            rallyAudio.playCheckpointChime();
          } else if (outcome === 'finish') {
            rallyAudio.playFinishFanfare(useGameStore.getState().isNewRecord);
          }
        }
      }
    }

    // --- 7. CAMERA CONTROLLER ---
    const perspCam = camera as THREE.PerspectiveCamera;
    if (phase === 'menu' || phase === 'finished') {
      orbitAngleRef.current += dt * (phase === 'menu' ? 0.28 : 0.36);
      const orbitRadius = phase === 'menu' ? 6.6 : 7.4;
      const orbitHeight = phase === 'menu' ? 2.15 : 2.6;
      _camGoal.set(
        _pos.x + Math.sin(orbitAngleRef.current) * orbitRadius,
        _pos.y + orbitHeight,
        _pos.z + Math.cos(orbitAngleRef.current) * orbitRadius,
      );
      _camLook.set(_pos.x, _pos.y + 0.85, _pos.z);

      if (!camInitializedRef.current) {
        _smoothCamPos.copy(_camGoal);
        _smoothCamLook.copy(_camLook);
        camInitializedRef.current = true;
      } else {
        _smoothCamPos.lerp(_camGoal, Math.min(1, dt * 4));
        _smoothCamLook.lerp(_camLook, Math.min(1, dt * 6));
      }
      camera.position.copy(_smoothCamPos);
      camera.lookAt(_smoothCamLook);
      if (perspCam.isPerspectiveCamera) {
        perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, 50, Math.min(1, dt * 5));
        perspCam.updateProjectionMatrix();
      }
    } else if (cameraMode === 'hood') {
      // Rally bonnet cam with subtle suspension feel
      _camGoal
        .set(0, 1.38, 0.42)
        .applyQuaternion(_quat)
        .add(_pos);
      _camLook
        .set(0, 1.15, 16)
        .applyQuaternion(_quat)
        .add(_pos);

      camera.position.copy(_camGoal);
      camera.lookAt(_camLook);
      if (perspCam.isPerspectiveCamera) {
        const targetFov = 64 + speedNorm * 14;
        perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFov, Math.min(1, dt * 6));
        perspCam.updateProjectionMatrix();
      }
    } else {
      // Chase Far or Chase Near with velocity-blended drift lookahead
      const isNear = cameraMode === 'chase_near';
      const dist = isNear ? 5.1 : 7.6;
      const height = isNear ? 2.0 : 2.95;

      // Blend car forward with velocity direction during forward drifts so camera swings smoothly around apex
      const horizForward = _forward.clone().setY(0).normalize();
      if (forwardSpeed > 5) {
        _velDir.set(_vel.x, 0, _vel.z).normalize();
        horizForward.lerp(_velDir, 0.34).normalize();
      }

      _camGoal
        .copy(_pos)
        .addScaledVector(horizForward, -dist)
        .add(new THREE.Vector3(0, height, 0));

      _camLook
        .copy(_pos)
        .addScaledVector(horizForward, 4.5)
        .add(new THREE.Vector3(0, isNear ? 1.05 : 1.25, 0));

      if (!camInitializedRef.current) {
        _smoothCamPos.copy(_camGoal);
        _smoothCamLook.copy(_camLook);
        camInitializedRef.current = true;
      } else {
        const followRate = isNear ? 11.5 : 8.5;
        _smoothCamPos.lerp(_camGoal, Math.min(1, dt * followRate));
        _smoothCamLook.lerp(_camLook, Math.min(1, dt * 13));
      }

      // Keep camera above road surface
      _smoothCamPos.y = Math.max(_pos.y + 0.9, _smoothCamPos.y);

      camera.position.copy(_smoothCamPos);
      camera.lookAt(_smoothCamLook);

      if (perspCam.isPerspectiveCamera) {
        const baseFov = isNear ? 62 : 56;
        const targetFov = baseFov + speedNorm * 15;
        perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFov, Math.min(1, dt * 5));
        perspCam.updateProjectionMatrix();
      }
    }
  });

  const initialStart = useGameStore.getState().checkpoints[0];

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[initialStart?.x ?? -14.5, 0.15, initialStart?.z ?? 120.0]}
      rotation={[0, initialStart?.yaw ?? -2.338, 0]}
      linearDamping={0.08}
      angularDamping={0.45}
      canSleep={false}
      ccd={true}
      onCollisionEnter={() => {
        const now = performance.now();
        if (
          useGameStore.getState().phase === 'racing' &&
          liveTelemetry.speedKmh > 14 &&
          now - lastImpactTimeRef.current > 220
        ) {
          lastImpactTimeRef.current = now;
          rallyAudio.playImpact(Math.min(1, liveTelemetry.speedKmh / 110));
        }
      }}
    >
      <CuboidCollider
        args={VEHICLE_TUNING.colliderHalfExtents}
        position={[0, VEHICLE_TUNING.colliderCenterY, 0]}
        mass={VEHICLE_TUNING.mass}
        friction={0.05}
        restitution={0.12}
      />
      {carRig && <primitive object={carRig.root} />}
    </RigidBody>
  );
}

useGLTF.preload(CAR_MODEL_URL);

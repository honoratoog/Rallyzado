import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { liveTelemetry, useGameStore } from '../store/useGameStore';

const MAX_PARTICLES = 240;
const MAX_SKIDS = 520;

interface DustParticle {
  alive: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
  color: THREE.Color;
}

/**
 * Instanced rally gravel/dust/tire smoke emitter + persistent ground skidmarks pool.
 * Zero React state updates per frame — pure GPU instancing.
 */
export function RallyEffects() {
  const dustRef = useRef<THREE.InstancedMesh | null>(null);
  const skidRef = useRef<THREE.InstancedMesh | null>(null);

  const particlesRef = useRef<DustParticle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      alive: false,
      age: 0,
      maxAge: 0.7,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      baseScale: 0.4,
      color: new THREE.Color('#c8b698'),
    })),
  );
  const particleCursorRef = useRef(0);
  const skidCursorRef = useRef(0);
  const prevWheelPosRef = useRef<THREE.Vector3[]>([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const prevWheelActiveRef = useRef<boolean[]>([false, false, false, false]);
  const spawnAccumRef = useRef(0);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const dustColorGravel = useMemo(() => new THREE.Color('#cbb694'), []);
  const dustColorSmoke = useMemo(() => new THREE.Color('#e5e7eb'), []);
  const hiddenMat = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const initializedRef = useRef(false);

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const dustMesh = dustRef.current;
    const skidMesh = skidRef.current;
    if (!dustMesh || !skidMesh) return;

    // Hide all unused slots on first frame
    if (!initializedRef.current) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        dustMesh.setMatrixAt(i, hiddenMat);
      }
      for (let i = 0; i < MAX_SKIDS; i++) {
        skidMesh.setMatrixAt(i, hiddenMat);
      }
      dustMesh.instanceMatrix.needsUpdate = true;
      skidMesh.instanceMatrix.needsUpdate = true;
      initializedRef.current = true;
    }

    const phase = useGameStore.getState().phase;
    const isActive = phase === 'racing';
    const { speedMs, throttle, handbrake, slipIntensity, wheels } = liveTelemetry;

    // --- 1. SPAWN DUST / TIRE SMOKE PARTICLES ---
    spawnAccumRef.current += dt;
    const shouldEmit =
      isActive &&
      speedMs > 2.2 &&
      (slipIntensity > 0.24 || (throttle > 0.75 && speedMs < 24) || handbrake);

    if (shouldEmit && spawnAccumRef.current >= 0.022) {
      spawnAccumRef.current = 0;
      const particles = particlesRef.current;

      for (let w = 0; w < 4; w++) {
        const wheel = wheels[w];
        if (!wheel.grounded) continue;
        // Primarily rear tires on launch/drift, all 4 on heavy drift
        if (!wheel.isRear && slipIntensity < 0.55) continue;

        const p = particles[particleCursorRef.current];
        particleCursorRef.current = (particleCursorRef.current + 1) % MAX_PARTICLES;

        p.alive = true;
        p.age = 0;
        p.maxAge = 0.45 + Math.random() * 0.42;
        p.x = wheel.x + (Math.random() - 0.5) * 0.22;
        p.y = wheel.y + 0.14;
        p.z = wheel.z + (Math.random() - 0.5) * 0.22;
        p.vx = (Math.random() - 0.5) * 1.9;
        p.vy = 0.8 + Math.random() * 1.3 + slipIntensity * 0.9;
        p.vz = (Math.random() - 0.5) * 1.9;
        p.baseScale = 0.28 + slipIntensity * 0.45 + Math.random() * 0.22;
        p.color.copy(handbrake || slipIntensity > 0.65 ? dustColorSmoke : dustColorGravel);
        dustMesh.setColorAt(
          (particleCursorRef.current + MAX_PARTICLES - 1) % MAX_PARTICLES,
          p.color,
        );
      }
      if (dustMesh.instanceColor) dustMesh.instanceColor.needsUpdate = true;
    }

    // Update all live particles
    const particles = particlesRef.current;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.alive = false;
        dustMesh.setMatrixAt(i, hiddenMat);
        continue;
      }

      const life = p.age / p.maxAge;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 0.94;
      p.vx *= 0.95;
      p.vz *= 0.95;

      const scale = p.baseScale * (0.55 + life * 1.65) * (1 - life * 0.85);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(life * 2.2, life * 1.7, 0);
      dummy.scale.setScalar(Math.max(0.001, scale));
      dummy.updateMatrix();
      dustMesh.setMatrixAt(i, dummy.matrix);
    }
    dustMesh.instanceMatrix.needsUpdate = true;

    // --- 2. STAMP GROUND SKIDMARKS ---
    let skidsUpdated = false;
    for (let w = 0; w < 4; w++) {
      const wheel = wheels[w];
      const skidding =
        isActive &&
        wheel.grounded &&
        speedMs > 3.2 &&
        (wheel.slip > 0.34 || (handbrake && wheel.isRear));

      if (!skidding) {
        prevWheelActiveRef.current[w] = false;
        continue;
      }

      const prevPos = prevWheelPosRef.current[w];
      if (!prevWheelActiveRef.current[w]) {
        prevPos.set(wheel.x, wheel.y, wheel.z);
        prevWheelActiveRef.current[w] = true;
        continue;
      }

      const dx = wheel.x - prevPos.x;
      const dz = wheel.z - prevPos.z;
      const segLen = Math.hypot(dx, dz);

      if (segLen >= 0.42 && segLen < 6.0) {
        const midX = (wheel.x + prevPos.x) * 0.5;
        const midY = (wheel.y + prevPos.y) * 0.5 + 0.025;
        const midZ = (wheel.z + prevPos.z) * 0.5;
        const yaw = Math.atan2(dx, dz);

        dummy.position.set(midX, midY, midZ);
        dummy.rotation.set(-Math.PI / 2, 0, yaw);
        dummy.scale.set(0.28, segLen + 0.08, 1);
        dummy.updateMatrix();

        skidMesh.setMatrixAt(skidCursorRef.current, dummy.matrix);
        skidCursorRef.current = (skidCursorRef.current + 1) % MAX_SKIDS;
        prevPos.set(wheel.x, wheel.y, wheel.z);
        skidsUpdated = true;
      } else if (segLen >= 6.0) {
        prevPos.set(wheel.x, wheel.y, wheel.z);
      }
    }

    if (skidsUpdated) {
      skidMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="RallyEffects">
      {/* Dust / Gravel / Drift Smoke Instanced Pool */}
      <instancedMesh
        ref={dustRef}
        args={[undefined, undefined, MAX_PARTICLES]}
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={1}
          metalness={0}
          transparent
          opacity={0.44}
          depthWrite={false}
        />
      </instancedMesh>

      {/* Tire Skidmarks Instanced Pool */}
      <instancedMesh
        ref={skidRef}
        args={[undefined, undefined, MAX_SKIDS]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#161618"
          transparent
          opacity={0.56}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </instancedMesh>
    </group>
  );
}

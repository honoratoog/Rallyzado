import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { liveTelemetry, useGameStore } from '../store/useGameStore';

function createCheckeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const size = 16;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const dark = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = dark ? '#111418' : '#f8fafc';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Checkpoints3D() {
  const checkpoints = useGameStore((s) => s.checkpoints);
  const nextCheckpointIndex = useGameStore((s) => s.nextCheckpointIndex);
  const phase = useGameStore((s) => s.phase);
  const debugOpen = useGameStore((s) => s.debugOpen);

  const arrowRef = useRef<THREE.Group | null>(null);
  const pulseRingRef = useRef<THREE.Mesh | null>(null);

  const checkeredTex = useMemo(() => createCheckeredTexture(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Animate active checkpoint gate pulse
    if (pulseRingRef.current) {
      const s = 1 + Math.sin(t * 4.5) * 0.04;
      pulseRingRef.current.scale.set(s, 1, s);
    }

    // Floating directional rally chevron above car pointing to the next checkpoint
    const arrow = arrowRef.current;
    if (arrow) {
      const cp = checkpoints[nextCheckpointIndex];
      if (phase === 'racing' && cp) {
        arrow.visible = true;
        const [cx, cy, cz] = liveTelemetry.position;
        arrow.position.set(cx, cy + 3.05 + Math.sin(t * 5) * 0.12, cz);
        const angle = Math.atan2(cp.x - cx, cp.z - cz);
        arrow.rotation.set(0, angle, 0);
      } else {
        arrow.visible = false;
      }
    }
  });

  const startCp = checkpoints[0];
  const activeCp = checkpoints[nextCheckpointIndex];

  return (
    <group name="RallyCheckpoints">
      {/* Start / Finish Gantry */}
      {startCp && (
        <group
          position={[startCp.x, startCp.y, startCp.z]}
          rotation={[0, startCp.yaw, 0]}
        >
          {/* Physical colliders for the Start/Finish gantry pillars */}
          <RigidBody
            key={`gantry-${startCp.x}-${startCp.z}-${startCp.yaw}`}
            type="fixed"
            colliders={false}
            friction={0.1}
            restitution={0.2}
          >
            <CuboidCollider args={[0.4, 3.6, 0.4]} position={[-9.2, 3.6, 0]} />
            <CuboidCollider args={[0.4, 3.6, 0.4]} position={[9.2, 3.6, 0]} />
          </RigidBody>

          {/* Left & Right Motorsport Trusses */}
          <mesh position={[-9.2, 3.6, 0]} castShadow>
            <boxGeometry args={[0.7, 7.2, 0.7]} />
            <meshStandardMaterial color="#e11d48" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[9.2, 3.6, 0]} castShadow>
            <boxGeometry args={[0.7, 7.2, 0.7]} />
            <meshStandardMaterial color="#e11d48" roughness={0.4} metalness={0.3} />
          </mesh>

          {/* Overhead Banner Beam */}
          <mesh position={[0, 6.8, 0]} castShadow>
            <boxGeometry args={[19.2, 1.5, 0.85]} />
            <meshStandardMaterial map={checkeredTex} roughness={0.45} />
          </mesh>

          {/* Top accent light strip */}
          <mesh position={[0, 7.65, 0]}>
            <boxGeometry args={[19.2, 0.22, 0.9]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={1.6}
            />
          </mesh>

          {/* Ground Start/Finish Checkered Line */}
          <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[17.5, 2.2]} />
            <meshStandardMaterial
              map={checkeredTex}
              roughness={0.85}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        </group>
      )}

      {/* Active Next Checkpoint Holographic Beacon */}
      {phase === 'racing' && activeCp && (
        <group
          position={[activeCp.x, activeCp.y, activeCp.z]}
          rotation={[0, activeCp.yaw, 0]}
        >
          {/* Left & Right Glowing Pylons */}
          <mesh position={[-7.5, 2.8, 0]}>
            <cylinderGeometry args={[0.28, 0.36, 5.6, 12]} />
            <meshStandardMaterial
              color={nextCheckpointIndex === 0 ? '#22c55e' : '#f59e0b'}
              emissive={nextCheckpointIndex === 0 ? '#22c55e' : '#f59e0b'}
              emissiveIntensity={1.8}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh position={[7.5, 2.8, 0]}>
            <cylinderGeometry args={[0.28, 0.36, 5.6, 12]} />
            <meshStandardMaterial
              color={nextCheckpointIndex === 0 ? '#22c55e' : '#f59e0b'}
              emissive={nextCheckpointIndex === 0 ? '#22c55e' : '#f59e0b'}
              emissiveIntensity={1.8}
              transparent
              opacity={0.85}
            />
          </mesh>

          {/* Translucent Gate Beam */}
          <mesh position={[0, 4.9, 0]}>
            <boxGeometry args={[15.4, 0.55, 0.25]} />
            <meshStandardMaterial
              color={nextCheckpointIndex === 0 ? '#4ade80' : '#fbbf24'}
              emissive={nextCheckpointIndex === 0 ? '#22c55e' : '#f59e0b'}
              emissiveIntensity={2.0}
              transparent
              opacity={0.78}
            />
          </mesh>

          {/* Pulsing Ground Ring */}
          <mesh
            ref={pulseRingRef}
            position={[0, 0.08, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[activeCp.radius - 0.55, activeCp.radius, 36]} />
            <meshBasicMaterial
              color={nextCheckpointIndex === 0 ? '#22c55e' : '#fbbf24'}
              transparent
              opacity={0.42}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* Floating Waypoint Directional Chevron above car */}
      <group ref={arrowRef} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.42, 1.15, 4]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f97316"
            emissiveIntensity={1.4}
            roughness={0.25}
          />
        </mesh>
      </group>

      {/* Debug Checkpoint Visualization (visible when pressing H) */}
      {debugOpen &&
        checkpoints.map((cp, idx) => (
          <group key={cp.id} position={[cp.x, cp.y + 0.12, cp.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[cp.radius - 0.35, cp.radius, 28]} />
              <meshBasicMaterial
                color={
                  idx === 0
                    ? '#22c55e'
                    : idx === nextCheckpointIndex
                      ? '#f59e0b'
                      : '#38bdf8'
                }
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 1.5, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 3.0, 8]} />
              <meshBasicMaterial
                color={idx === 0 ? '#22c55e' : '#38bdf8'}
                transparent
                opacity={0.7}
              />
            </mesh>
          </group>
        ))}
    </group>
  );
}

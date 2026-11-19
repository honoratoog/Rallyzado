import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { liveTelemetry } from '../store/useGameStore';

/**
 * Atmospheric rally lighting:
 * - Procedural daylight/golden-afternoon sky dome
 * - Procedural PMREM environment reflections (zero external HDRI dependency)
 * - Directional sun light with shadow frustum tracking the player car for crisp shadows everywhere
 * - Depth fog blending the distant horizon
 */
export function EnvironmentLighting() {
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const targetRef = useRef<THREE.Object3D | null>(null);

  useFrame(() => {
    const sun = sunRef.current;
    const target = targetRef.current;
    if (!sun || !target) return;
    const [x, y, z] = liveTelemetry.position;
    target.position.set(x, y, z);
    target.updateMatrixWorld();
    sun.position.set(x + 55, y + 68, z + 38);
    sun.target = target;
  });

  return (
    <>
      <color attach="background" args={['#b8d0e4']} />
      <fog attach="fog" args={['#c8d8e6', 110, 420]} />

      <Sky
        distance={450000}
        sunPosition={[95, 42, 65]}
        turbidity={5.5}
        rayleigh={1.6}
        mieCoefficient={0.008}
        mieDirectionalG={0.82}
      />

      {/* Procedural HDRI environment reflections for car paint & metal rails */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="ring"
          intensity={1.6}
          color="#fff4e0"
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[24, 24, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.4}
          color="#ffe3b3"
          position={[15, 8, 12]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[18, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.9}
          color="#8fbce6"
          position={[-14, 6, -10]}
          rotation={[0, Math.PI / 3, 0]}
          scale={[22, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.65}
          color="#6f6a5c"
          position={[0, -6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
      </Environment>

      {/* Warm rally sunlight with moving tight shadow frustum */}
      <object3D ref={targetRef} />
      <directionalLight
        ref={sunRef}
        position={[55, 68, 38]}
        intensity={2.6}
        color="#fff1d6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={5}
        shadow-camera-far={190}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />

      <hemisphereLight args={['#a9d1f5', '#5a5343', 0.85]} />
      <ambientLight intensity={0.22} />
    </>
  );
}

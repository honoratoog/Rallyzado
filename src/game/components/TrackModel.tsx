import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { prepareTrackScene } from '../utils/glbNormalization';
import { trackSurfaceSampler, useGameStore } from '../store/useGameStore';

export const TRACK_MODEL_URL = '/models/drift_race_track_free.glb';

interface BakedMeshEntry {
  key: string;
  geometry: THREE.BufferGeometry;
}

function bakeWorldMeshes(meshes: THREE.Mesh[], prefix: string): BakedMeshEntry[] {
  const entries: BakedMeshEntry[] = [];
  meshes.forEach((mesh, idx) => {
    mesh.updateMatrixWorld(true);
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    entries.push({ key: `${prefix}-${idx}-${mesh.name}`, geometry: geom });
  });
  return entries;
}

export function TrackModel() {
  const gltf = useGLTF(TRACK_MODEL_URL);
  const setTrackLoaded = useGameStore((s) => s.setTrackLoaded);
  const resetCounter = useGameStore((s) => s.resetCounter);

  const prepared = useMemo(() => prepareTrackScene(gltf.scene), [gltf.scene]);

  const drivableColliders = useMemo(
    () => bakeWorldMeshes(prepared.drivableMeshes, 'drivable'),
    [prepared],
  );

  const barrierColliders = useMemo(
    () => bakeWorldMeshes(prepared.barrierMeshes, 'barrier'),
    [prepared],
  );

  useEffect(() => {
    trackSurfaceSampler.sampleHeight = prepared.sampleGroundHeight;
    trackSurfaceSampler.ready = true;
    setTrackLoaded(true);

    return () => {
      drivableColliders.forEach((c) => c.geometry.dispose());
      barrierColliders.forEach((c) => c.geometry.dispose());
      prepared.dynamicProps.forEach((p) => p.geometry.dispose());
    };
  }, [prepared, drivableColliders, barrierColliders, setTrackLoaded]);

  return (
    <group name="RallyTrackRoot">
      {/* Full visual track scene (road, terrain, rails, barriers, arrows, banners, bushes) */}
      <primitive object={prepared.visualScene} />

      {/* Static trimesh physics collider for drivable road & terrain (includeInvisible is CRITICAL for hidden meshes!) */}
      <RigidBody
        type="fixed"
        colliders="trimesh"
        includeInvisible
        friction={0.92}
        restitution={0.02}
      >
        {drivableColliders.map((item) => (
          <mesh key={item.key} geometry={item.geometry} visible={false}>
            <meshBasicMaterial />
          </mesh>
        ))}
      </RigidBody>

      {/* Static trimesh physics collider for ALL guardrails, barriers, cylinders, banners, arrows & flag posts */}
      {barrierColliders.length > 0 && (
        <RigidBody
          type="fixed"
          colliders="trimesh"
          includeInvisible
          friction={0.05}
          restitution={0.22}
        >
          {barrierColliders.map((item) => (
            <mesh key={item.key} geometry={item.geometry} visible={false}>
              <meshBasicMaterial />
            </mesh>
          ))}
        </RigidBody>
      )}

      {/* Dynamic knockable traffic cones — fly & tumble when clipped and reset on stage restart */}
      {prepared.dynamicProps.map((prop) => (
        <RigidBody
          key={`${prop.key}-${resetCounter}`}
          type="dynamic"
          colliders="hull"
          position={prop.position}
          mass={6}
          friction={0.65}
          restitution={0.25}
          linearDamping={0.45}
          angularDamping={0.55}
        >
          <mesh
            geometry={prop.geometry}
            material={prop.material}
            castShadow
            receiveShadow
          />
        </RigidBody>
      ))}

      {/* Safety under-floor catcher so vehicles can never fall into the void */}
      <RigidBody type="fixed" friction={0.85} restitution={0}>
        <CuboidCollider args={[360, 1, 360]} position={[0, -1.08, 25]} />
      </RigidBody>
    </group>
  );
}

useGLTF.preload(TRACK_MODEL_URL);

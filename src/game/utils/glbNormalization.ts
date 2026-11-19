import * as THREE from 'three';
import type { CarCatalogEntry } from '../types';

const WHEEL_REGEX = /(wheel|tire|tyre|roda|pneu|rim|jante|\bfl\b|\bfr\b|\brl\b|\brr\b)/i;
const ACCESSORY_REGEX = /(spoiler|alettone|wing|fanale|fanali|light|lamp|exhaust|bumper|mirror|antenna|cage|glass|window|interior)/i;

/** Friendly display names & eras for known body nodes in 1965-2002_rally_cars.glb */
const KNOWN_CAR_METADATA: Record<string, { name: string; era: string }> = {
  'Audi Quattro': { name: 'Audi Sport Quattro S1', era: '1984 • Grupo B' },
  'Subaru Impreza': { name: 'Subaru Impreza WRC', era: '1998 • WRC' },
  'Lancia Delta': { name: 'Lancia Delta HF Integrale', era: '1992 • Grupo A' },
  'Lancia S4': { name: 'Lancia Delta S4', era: '1985 • Grupo B' },
  'Ford RS200': { name: 'Ford RS200', era: '1986 • Grupo B' },
  'Peugeot 205': { name: 'Peugeot 205 T16', era: '1985 • Grupo B' },
  'Toyota Celica': { name: 'Toyota Celica GT-Four', era: '1993 • Grupo A' },
  'BMW E30': { name: 'BMW M3 E30 Rally', era: '1987 • Grupo A' },
  'Ford Escort RS1800': { name: 'Ford Escort RS1800', era: '1979 • Grupo 4' },
  'Ford Cosworth': { name: 'Ford Escort RS Cosworth', era: '1993 • Grupo A' },
  'Porsche 911': { name: 'Porsche 911 SC Rally', era: '1980 • Grupo 4' },
  'Renault R5': { name: 'Renault 5 Turbo', era: '1981 • Grupo 4' },
  'Fiat 131': { name: 'Fiat 131 Abarth', era: '1978 • Grupo 4' },
  'Renault Alpine': { name: 'Alpine A110 1600S', era: '1973 • Clássico' },
  'Lancia Fulvia': { name: 'Lancia Fulvia HF', era: '1972 • Clássico' },
  'body_geo #370683': { name: 'Lancia Stratos HF', era: '1975 • Grupo 4' },
  'body_geo #370564': { name: 'Mini Cooper S Rally', era: '1965 • Clássico' },
  'body_geo': { name: 'Mitsubishi Lancer Evo', era: '1999 • WRC' },
};

const CAR_SORT_PRIORITY = [
  'Audi Quattro',
  'Subaru Impreza',
  'Lancia Delta',
  'Ford RS200',
  'Peugeot 205',
  'Lancia S4',
  'Toyota Celica',
  'Ford Escort RS1800',
  'BMW E30',
  'Porsche 911',
  'Ford Cosworth',
  'Renault R5',
  'body_geo #370683',
  'body_geo',
  'Fiat 131',
  'Renault Alpine',
  'Lancia Fulvia',
  'body_geo #370564',
];

export interface NormalizedWheelRig {
  /** Outer mount positioned at normalized axle location (handles vertical suspension travel) */
  mount: THREE.Group;
  /** Steer pivot (rotates around Y for front wheels) */
  steerPivot: THREE.Group;
  /** Spin pivot (rotates around X for rolling) */
  spinPivot: THREE.Group;
  /** Normalized rest position relative to vehicle origin (y=0 at tire bottom) */
  restPosition: THREE.Vector3;
  radius: number;
  isFront: boolean;
  isLeft: boolean;
}

export interface NormalizedCarRig {
  /** Root container: tire bottoms at y=0, centered X/Z, forward = +Z, length ≈ 4.2m */
  root: THREE.Group;
  /** Sprung chassis group (body + spoiler + accessories) for dynamic pitch/roll suspension tilt */
  chassisGroup: THREE.Group;
  /** Detected wheels: fl, fr, rl, rr */
  wheels: {
    fl: NormalizedWheelRig | null;
    fr: NormalizedWheelRig | null;
    rl: NormalizedWheelRig | null;
    rr: NormalizedWheelRig | null;
  };
  hasWheels: boolean;
  wheelRadius: number;
  wheelBase: number;
  trackWidth: number;
  dimensions: THREE.Vector3;
  scaleFactor: number;
}

interface MeshEntry {
  mesh: THREE.Mesh;
  ownerName: string;
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  isWheel: boolean;
  isAccessory: boolean;
}

function collectMeshEntries(root: THREE.Object3D): MeshEntry[] {
  root.updateMatrixWorld(true);
  const entries: MeshEntry[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const ownerName = obj.parent?.name || obj.name;
    const combinedName = `${ownerName} ${obj.name}`;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const isWheel =
      WHEEL_REGEX.test(combinedName) ||
      (size.y > 0.35 &&
        size.y < 1.0 &&
        Math.abs(size.y - size.z) < 0.15 &&
        size.x < size.y * 0.7);
    const isAccessory = !isWheel && ACCESSORY_REGEX.test(combinedName);
    entries.push({ mesh: obj, ownerName, box, center, size, isWheel, isAccessory });
  });
  return entries;
}

/**
 * Inspects a loaded car GLB scene and detects whether it contains a single car
 * or a multi-car pack (such as 1965-2002_rally_cars.glb), returning clean catalog entries.
 */
export function extractCarCatalog(scene: THREE.Object3D): CarCatalogEntry[] {
  const entries = collectMeshEntries(scene);
  const bodies = entries.filter(
    (e) =>
      !e.isWheel &&
      !e.isAccessory &&
      Math.max(e.size.x, e.size.z) >= 2.2,
  );

  // Fallback for single-car GLBs where parts might be split into many small meshes
  if (bodies.length <= 1) {
    const fullBox = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    fullBox.getCenter(center);
    fullBox.getSize(size);
    return [
      {
        id: 'default-car',
        name: 'Rally Car',
        era: 'Custom GLB',
        bodyNodeName: bodies[0]?.ownerName ?? 'root',
        meshNames: entries.map((e) => e.mesh.name),
        wheelNodeNames: entries.filter((e) => e.isWheel).map((e) => e.mesh.name),
        center: [center.x, center.y, center.z],
        length: Math.max(size.x, size.z),
      },
    ];
  }

  // Multi-car pack: associate each accessory and wheel with its closest car body
  const clusters = new Map<
    string,
    {
      body: MeshEntry;
      meshes: MeshEntry[];
      wheels: MeshEntry[];
    }
  >();

  for (const b of bodies) {
    clusters.set(b.ownerName, { body: b, meshes: [b], wheels: [] });
  }

  for (const e of entries) {
    if (clusters.has(e.ownerName) && e.mesh === clusters.get(e.ownerName)!.body.mesh) {
      continue;
    }
    // Find nearest car body in XZ plane
    let nearestKey: string | null = null;
    let nearestDist = Infinity;
    for (const [key, cluster] of clusters.entries()) {
      const dx = e.center.x - cluster.body.center.x;
      const dz = e.center.z - cluster.body.center.z;
      const d = Math.hypot(dx, dz);
      if (d < nearestDist) {
        nearestDist = d;
        nearestKey = key;
      }
    }
    if (nearestKey && nearestDist < 3.2) {
      const target = clusters.get(nearestKey)!;
      target.meshes.push(e);
      if (e.isWheel) target.wheels.push(e);
    }
  }

  const catalog: CarCatalogEntry[] = [];
  for (const [ownerName, cluster] of clusters.entries()) {
    const normalizedKey = ownerName.replace(/_/g, ' ');
    const meta =
      KNOWN_CAR_METADATA[ownerName] ??
      KNOWN_CAR_METADATA[normalizedKey] ?? {
        name: normalizedKey,
        era: 'Rally Classic',
      };
    catalog.push({
      id: ownerName,
      name: meta.name,
      era: meta.era,
      bodyNodeName: ownerName,
      meshNames: cluster.meshes.map((m) => m.mesh.name),
      wheelNodeNames: cluster.wheels.map((w) => w.mesh.name),
      center: [
        cluster.body.center.x,
        cluster.body.center.y,
        cluster.body.center.z,
      ],
      length: Math.max(cluster.body.size.x, cluster.body.size.z),
    });
  }

  catalog.sort((a, b) => {
    const ka = a.id.replace(/_/g, ' ');
    const kb = b.id.replace(/_/g, ' ');
    const ia = Math.max(CAR_SORT_PRIORITY.indexOf(a.id), CAR_SORT_PRIORITY.indexOf(ka));
    const ib = Math.max(CAR_SORT_PRIORITY.indexOf(b.id), CAR_SORT_PRIORITY.indexOf(kb));
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return catalog;
}

/**
 * Clones and normalizes a single car from the loaded GLB scene:
 * - Scales uniformly to targetLength (~4.2m)
 * - Aligns longest horizontal axis along +Z (forward)
 * - Places tire bottom cleanly at y = 0, centered on X = 0, Z = 0
 * - Enables castShadow / receiveShadow on all meshes
 * - Separates and re-pivots wheel meshes (FL, FR, RL, RR) for steer & spin animations
 */
export function buildNormalizedCar(
  sourceScene: THREE.Object3D,
  entry: CarCatalogEntry,
  targetLength = 4.2,
): NormalizedCarRig {
  sourceScene.updateMatrixWorld(true);
  const allowedMeshes = new Set(entry.meshNames);
  const wheelMeshNames = new Set(entry.wheelNodeNames);

  // Extract world-space clones of only the selected car's meshes
  const extractedChassis: THREE.Mesh[] = [];
  const extractedWheels: { mesh: THREE.Mesh; box: THREE.Box3; center: THREE.Vector3 }[] = [];
  const combinedBox = new THREE.Box3();

  sourceScene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (allowedMeshes.size > 0 && !allowedMeshes.has(obj.name)) return;

    const clonedGeom = obj.geometry.clone();
    clonedGeom.applyMatrix4(obj.matrixWorld);
    clonedGeom.computeBoundingBox();
    clonedGeom.computeVertexNormals();

    const clonedMat = Array.isArray(obj.material)
      ? obj.material.map((m) => m.clone())
      : obj.material.clone();

    // Boost clearcoat/roughness subtly so rally paint looks rich under procedural HDRI
    const mats = Array.isArray(clonedMat) ? clonedMat : [clonedMat];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial) {
        m.envMapIntensity = 1.15;
        m.needsUpdate = true;
      }
    }

    const mesh = new THREE.Mesh(clonedGeom, clonedMat);
    mesh.name = obj.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const box = new THREE.Box3().setFromObject(mesh);
    combinedBox.union(box);

    if (wheelMeshNames.has(obj.name)) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      extractedWheels.push({ mesh, box, center });
    } else {
      extractedChassis.push(mesh);
    }
  });

  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  combinedBox.getSize(rawSize);
  combinedBox.getCenter(rawCenter);

  // Determine if the model's longest horizontal axis is X instead of Z
  const rotate90Y = rawSize.x > rawSize.z * 1.15;
  const rawLength = Math.max(rawSize.x, rawSize.z, 0.001);
  const scaleFactor = targetLength / rawLength;

  // Normalization matrix: center X/Z -> floor Y to 0 -> optional 90deg Y -> uniform scale
  const normMatrix = new THREE.Matrix4();
  const translateToOrigin = new THREE.Matrix4().makeTranslation(
    -rawCenter.x,
    -combinedBox.min.y,
    -rawCenter.z,
  );
  const rotMat = rotate90Y
    ? new THREE.Matrix4().makeRotationY(Math.PI / 2)
    : new THREE.Matrix4();
  const scaleMat = new THREE.Matrix4().makeScale(
    scaleFactor,
    scaleFactor,
    scaleFactor,
  );

  normMatrix.multiply(scaleMat).multiply(rotMat).multiply(translateToOrigin);

  const root = new THREE.Group();
  root.name = `NormalizedCar_${entry.id}`;

  const chassisGroup = new THREE.Group();
  chassisGroup.name = 'ChassisGroup';
  root.add(chassisGroup);

  const normalizedFullBox = new THREE.Box3();

  for (const mesh of extractedChassis) {
    mesh.geometry.applyMatrix4(normMatrix);
    mesh.geometry.computeBoundingBox();
    chassisGroup.add(mesh);
    if (mesh.geometry.boundingBox) {
      normalizedFullBox.union(mesh.geometry.boundingBox);
    }
  }

  // Re-pivot and classify wheels spatially (FL: +X/+Z, FR: -X/+Z, RL: +X/-Z, RR: -X/-Z)
  // Note: When facing +Z in right-handed Three.js space (+Y up), driver's LEFT is +X and RIGHT is -X.
  const wheels: NormalizedCarRig['wheels'] = {
    fl: null,
    fr: null,
    rl: null,
    rr: null,
  };

  let sumRadius = 0;
  let radiusCount = 0;

  for (const w of extractedWheels) {
    w.mesh.geometry.applyMatrix4(normMatrix);
    w.mesh.geometry.computeBoundingBox();
    const wb = w.mesh.geometry.boundingBox!;
    normalizedFullBox.union(wb);

    const wCenter = new THREE.Vector3();
    const wSize = new THREE.Vector3();
    wb.getCenter(wCenter);
    wb.getSize(wSize);

    // Recenter wheel geometry around its own axle center (0, 0, 0) for clean spin/steer
    w.mesh.geometry.translate(-wCenter.x, -wCenter.y, -wCenter.z);
    w.mesh.geometry.computeBoundingBox();

    const radius = Math.max(wSize.y, wSize.z) * 0.5;
    sumRadius += radius;
    radiusCount++;

    const isFront = wCenter.z >= 0;
    const isLeft = wCenter.x >= 0;

    const mount = new THREE.Group();
    mount.position.copy(wCenter);

    const steerPivot = new THREE.Group();
    const spinPivot = new THREE.Group();
    spinPivot.add(w.mesh);
    steerPivot.add(spinPivot);
    mount.add(steerPivot);
    root.add(mount);

    const rig: NormalizedWheelRig = {
      mount,
      steerPivot,
      spinPivot,
      restPosition: wCenter.clone(),
      radius,
      isFront,
      isLeft,
    };

    const slot: keyof NormalizedCarRig['wheels'] = isFront
      ? isLeft
        ? 'fl'
        : 'fr'
      : isLeft
        ? 'rl'
        : 'rr';

    // If a car had duplicate wheel slots, keep the first or attach extra mesh to existing spinPivot
    if (!wheels[slot]) {
      wheels[slot] = rig;
    } else {
      wheels[slot]!.spinPivot.add(w.mesh);
      root.remove(mount);
    }
  }

  const dimensions = new THREE.Vector3();
  normalizedFullBox.getSize(dimensions);

  const avgWheelRadius = radiusCount > 0 ? sumRadius / radiusCount : 0.33;
  const wheelBase =
    wheels.fl && wheels.rl
      ? Math.abs(wheels.fl.restPosition.z - wheels.rl.restPosition.z)
      : dimensions.z * 0.58;
  const trackWidth =
    wheels.fl && wheels.fr
      ? Math.abs(wheels.fl.restPosition.x - wheels.fr.restPosition.x)
      : dimensions.x * 0.84;

  return {
    root,
    chassisGroup,
    wheels,
    hasWheels: radiusCount > 0,
    wheelRadius: avgWheelRadius,
    wheelBase,
    trackWidth,
    dimensions,
    scaleFactor,
  };
}

export interface DynamicPropEntry {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  position: [number, number, number];
}

export interface PreparedTrack {
  visualScene: THREE.Group;
  drivableMeshes: THREE.Mesh[];
  barrierMeshes: THREE.Mesh[];
  dynamicProps: DynamicPropEntry[];
  boundingBox: THREE.Box3;
  sampleGroundHeight: (x: number, z: number, fallbackY?: number) => number;
}

const FOLIAGE_NON_COLLIDER_REGEX = /(bush|leaf|foliage|tree|grass)/i;
const DYNAMIC_PROP_REGEX = /(^|\b)cone(\b|\.|_|\d)/i;
const BARRIER_COLLIDER_REGEX = /(rail|barrier|wall|guard|fence|banner|arrow|flag|post|pillar|curb|kerb)/i;

/**
 * Inspects and normalizes the track GLB:
 * - Enables appropriate shadows across all meshes
 * - Separates drivable ground/road meshes, solid static barrier/rail/post colliders,
 *   dynamic knockable props (cones), and non-colliding foliage (bushes)
 * - Provides a vertical raycaster to determine exact ground elevation at any (X, Z) coordinate
 */
export function prepareTrackScene(sourceScene: THREE.Object3D): PreparedTrack {
  const visualScene = sourceScene.clone(true) as THREE.Group;
  visualScene.updateMatrixWorld(true);

  const drivableMeshes: THREE.Mesh[] = [];
  const barrierMeshes: THREE.Mesh[] = [];
  const dynamicProps: DynamicPropEntry[] = [];
  const meshesToHideInStatic: THREE.Mesh[] = [];
  const boundingBox = new THREE.Box3();

  visualScene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const parentName = obj.parent?.name || '';
    const fullName = `${parentName} ${obj.name}`;
    const matName = Array.isArray(obj.material)
      ? obj.material.map((m) => m.name).join(' ')
      : obj.material?.name || '';
    const combined = `${fullName} ${matName}`;

    const isDrivable = /(terrain|road|ground|asphalt|track|floor|gravel|dirt)/i.test(
      combined,
    );
    const isFoliage = !isDrivable && FOLIAGE_NON_COLLIDER_REGEX.test(combined);
    const isDynamicProp =
      !isDrivable && !isFoliage && DYNAMIC_PROP_REGEX.test(fullName);
    const isBarrier =
      !isDrivable &&
      !isFoliage &&
      !isDynamicProp &&
      BARRIER_COLLIDER_REGEX.test(combined);

    obj.receiveShadow = true;
    obj.castShadow = !isDrivable; // road/terrain shouldn't self-shadow artifacts

    // Ensure materials look crisp with proper tone mapping & no washed-out specular
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial) {
        if (isDrivable) {
          m.roughness = Math.max(m.roughness, 0.78);
          m.envMapIntensity = 0.65;
        }
        m.needsUpdate = true;
      }
    }

    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) boundingBox.union(box);

    if (isDrivable) {
      drivableMeshes.push(obj);
    } else if (isDynamicProp) {
      // Detach dynamic prop into its own world-centered geometry for dynamic RigidBody physics
      const center = new THREE.Vector3();
      box.getCenter(center);
      const geom = obj.geometry.clone();
      geom.applyMatrix4(obj.matrixWorld);
      geom.translate(-center.x, -center.y, -center.z);
      geom.computeBoundingBox();

      dynamicProps.push({
        key: `prop-${dynamicProps.length}-${parentName || obj.name}`,
        geometry: geom,
        material: obj.material,
        position: [center.x, center.y + 0.02, center.z],
      });
      meshesToHideInStatic.push(obj);
    } else if (isBarrier) {
      barrierMeshes.push(obj);
    }
  });

  // Hide detached dynamic props from the static visual tree so they are rendered solely by their RigidBody
  for (const m of meshesToHideInStatic) {
    m.visible = false;
  }

  // Fallback: if a generic map GLB doesn't name road/terrain explicitly, treat all non-foliage meshes as drivable
  if (drivableMeshes.length === 0) {
    visualScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible) drivableMeshes.push(obj);
    });
  }

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);

  const sampleGroundHeight = (x: number, z: number, fallbackY = 0): number => {
    origin.set(x, Math.max(boundingBox.max.y + 40, 80), z);
    raycaster.set(origin, down);
    raycaster.far = 300;
    const hits = raycaster.intersectObjects(drivableMeshes, false);
    if (hits.length > 0) {
      return hits[0].point.y;
    }
    return fallbackY;
  };

  return {
    visualScene,
    drivableMeshes,
    barrierMeshes,
    dynamicProps,
    boundingBox,
    sampleGroundHeight,
  };
}

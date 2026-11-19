import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { GameScene } from './game/components/GameScene';
import { StartMenu } from './ui/StartMenu';
import { RaceHUD } from './ui/RaceHUD';
import { FinishOverlay } from './ui/FinishOverlay';
import { DebugPanel } from './ui/DebugPanel';
import { useGameStore } from './game/store/useGameStore';

export function App() {
  const trackLoaded = useGameStore((s) => s.trackLoaded);
  const carLoaded = useGameStore((s) => s.carLoaded);
  const isReady = trackLoaded && carLoaded;

  return (
    <div className="app-shell">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: 55, near: 0.15, far: 900, position: [-8, 3, 128] }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
      >
        <GameScene />
      </Canvas>

      {/* Initial asset loader veil while the 57MB track GLB & car pack initialize */}
      {!isReady && (
        <div className="loader-veil">
          <div className="loader-card">
            <div className="loader-spinner" />
            <div className="loader-title">RALLYZADO</div>
            <div className="loader-status">
              {!trackLoaded
                ? 'Carregando pista e colisores 3D...'
                : 'Normalizando frota de carros de rally...'}
            </div>
          </div>
        </div>
      )}

      <StartMenu />
      <RaceHUD />
      <FinishOverlay />
      <DebugPanel />
    </div>
  );
}

export default App;

import { Suspense, useEffect } from 'react';
import { Physics } from '@react-three/rapier';
import { EnvironmentLighting } from './EnvironmentLighting';
import { TrackModel } from './TrackModel';
import { RallyVehicle } from '../physics/RallyVehicle';
import { Checkpoints3D } from './Checkpoints3D';
import { RallyEffects } from './RallyEffects';
import { useGameStore } from '../store/useGameStore';
import { rallyAudio } from '../audio/RallyAudioEngine';

export function GameScene() {
  const phase = useGameStore((s) => s.phase);
  const setCountdownValue = useGameStore((s) => s.setCountdownValue);
  const beginRacing = useGameStore((s) => s.beginRacing);

  // Stage start 3 - 2 - 1 - GO! sequence with procedural audio beeps
  useEffect(() => {
    if (phase !== 'countdown') return;

    rallyAudio.init();
    setCountdownValue(3);
    rallyAudio.playCountdownBeep(false);

    const t1 = window.setTimeout(() => {
      if (useGameStore.getState().phase !== 'countdown') return;
      setCountdownValue(2);
      rallyAudio.playCountdownBeep(false);
    }, 900);

    const t2 = window.setTimeout(() => {
      if (useGameStore.getState().phase !== 'countdown') return;
      setCountdownValue(1);
      rallyAudio.playCountdownBeep(false);
    }, 1800);

    const t3 = window.setTimeout(() => {
      if (useGameStore.getState().phase !== 'countdown') return;
      beginRacing();
      rallyAudio.playCountdownBeep(true);
    }, 2700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [phase, setCountdownValue, beginRacing]);

  return (
    <>
      <EnvironmentLighting />

      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <TrackModel />
          <RallyVehicle />
          <Checkpoints3D />
        </Physics>
      </Suspense>

      <RallyEffects />
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Home,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { liveTelemetry, useGameStore } from '../game/store/useGameStore';
import { rallyAudio } from '../game/audio/RallyAudioEngine';
import { formatRaceTime } from './formatTime';

const RPM_SEGMENTS = 24;

const CAMERA_LABELS = {
  chase_far: 'CHASE LONGA',
  chase_near: 'CHASE PRÓXIMA',
  hood: 'CAPÔ',
} as const;

interface HudSnapshot {
  speedKmh: number;
  rpm: number;
  rpmNormalized: number;
  gear: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  driftAngleDeg: number;
  carX: number;
  carZ: number;
  carYaw: number;
  timerMs: number;
  distToNext: number;
}

export function RaceHUD() {
  const phase = useGameStore((s) => s.phase);
  const countdownValue = useGameStore((s) => s.countdownValue);
  const checkpoints = useGameStore((s) => s.checkpoints);
  const nextCheckpointIndex = useGameStore((s) => s.nextCheckpointIndex);
  const passedCount = useGameStore((s) => s.passedCount);
  const lastCheckpointFlash = useGameStore((s) => s.lastCheckpointFlash);
  const record = useGameStore((s) => s.record);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const muted = useGameStore((s) => s.muted);
  const debugOpen = useGameStore((s) => s.debugOpen);

  const cycleCamera = useGameStore((s) => s.cycleCamera);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const startStage = useGameStore((s) => s.startStage);
  const requestReset = useGameStore((s) => s.requestReset);
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  const [hud, setHud] = useState<HudSnapshot>({
    speedKmh: 0,
    rpm: 1100,
    rpmNormalized: 0.05,
    gear: 1,
    throttle: 0,
    brake: 0,
    handbrake: false,
    driftAngleDeg: 0,
    carX: -14.5,
    carZ: 120,
    carYaw: -2.338,
    timerMs: 0,
    distToNext: 0,
  });

  const [showGoBanner, setShowGoBanner] = useState(false);

  // Brief "GO!" banner right after countdown finishes
  useEffect(() => {
    if (phase === 'racing') {
      setShowGoBanner(true);
      const t = window.setTimeout(() => setShowGoBanner(false), 900);
      return () => window.clearTimeout(t);
    }
    setShowGoBanner(false);
  }, [phase]);

  // Smooth 30-60Hz HUD polling from mutable liveTelemetry (keeps React super light)
  useEffect(() => {
    if (phase !== 'racing' && phase !== 'countdown') return;
    let rafId = 0;

    const tick = () => {
      const st = useGameStore.getState();
      const now = performance.now();
      const timerMs =
        st.phase === 'racing' && st.stageStartTimestamp !== null
          ? now - st.stageStartTimestamp
          : 0;

      const cp = st.checkpoints[st.nextCheckpointIndex];
      const distToNext = cp
        ? Math.hypot(
            liveTelemetry.position[0] - cp.x,
            liveTelemetry.position[2] - cp.z,
          )
        : 0;

      setHud({
        speedKmh: Math.round(liveTelemetry.speedKmh),
        rpm: Math.round(liveTelemetry.rpm),
        rpmNormalized: liveTelemetry.rpmNormalized,
        gear: liveTelemetry.gear,
        throttle: liveTelemetry.throttle,
        brake: liveTelemetry.brake,
        handbrake: liveTelemetry.handbrake,
        driftAngleDeg: Math.round(liveTelemetry.driftAngleDeg),
        carX: liveTelemetry.position[0],
        carZ: liveTelemetry.position[2],
        carYaw: liveTelemetry.yaw,
        timerMs,
        distToNext: Math.round(distToNext),
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  // Minimap coordinate bounds
  const mapBounds = useMemo(() => {
    let minX = -160;
    let maxX = 100;
    let minZ = -135;
    let maxZ = 180;
    for (const cp of checkpoints) {
      minX = Math.min(minX, cp.x - 20);
      maxX = Math.max(maxX, cp.x + 20);
      minZ = Math.min(minZ, cp.z - 20);
      maxZ = Math.max(maxZ, cp.z + 20);
    }
    return { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
  }, [checkpoints]);

  if (phase !== 'racing' && phase !== 'countdown') return null;

  const toMapX = (x: number) => ((x - mapBounds.minX) / mapBounds.w) * 144 + 8;
  const toMapY = (z: number) => ((z - mapBounds.minZ) / mapBounds.h) * 144 + 8;

  const pathPoints = checkpoints.map((c) => `${toMapX(c.x).toFixed(1)},${toMapY(c.z).toFixed(1)}`).join(' ');
  const activeCp = checkpoints[nextCheckpointIndex];
  const litSegments = Math.round(hud.rpmNormalized * RPM_SEGMENTS);
  const gearLabel = hud.gear === -1 ? 'R' : hud.gear === 0 ? 'N' : String(hud.gear);
  const isDrifting = phase === 'racing' && hud.speedKmh > 24 && hud.driftAngleDeg >= 14;

  return (
    <div className="hud-root">
      {/* Top Left: Stage Timing & Checkpoints */}
      <div className="hud-top-left">
        <div className="hud-panel timer-panel">
          <div className="timer-row">
            <span className="micro-label">ESTÁGIO</span>
            <span className="cp-badge">
              CP {passedCount} / {checkpoints.length}
            </span>
          </div>
          <div className="main-timer mono">{formatRaceTime(hud.timerMs)}</div>
          <div className="best-row">
            <Trophy size={13} className="accent-amber" />
            <span>RECORDE</span>
            <strong className="mono">{formatRaceTime(record.bestTimeMs)}</strong>
          </div>
        </div>

        {activeCp && (
          <div className="hud-panel next-cp-pill">
            <span className="next-dot" />
            <div className="next-cp-text">
              <span className="micro-label">
                {nextCheckpointIndex === 0 ? 'LINHA DE CHEGADA' : 'PRÓXIMO CHECKPOINT'}
              </span>
              <strong>
                {activeCp.name} • {hud.distToNext}m
              </strong>
            </div>
          </div>
        )}

        {lastCheckpointFlash && (
          <div key={lastCheckpointFlash.key} className="cp-flash-toast">
            <span>✓ {lastCheckpointFlash.name}</span>
            <strong className="mono">{formatRaceTime(lastCheckpointFlash.splitMs)}</strong>
          </div>
        )}
      </div>

      {/* Top Right: Quick Toolbar + Minimap */}
      <div className="hud-top-right">
        <div className="hud-toolbar">
          <button className="hud-pill-btn" onClick={cycleCamera} title="Alternar Câmera (C)">
            <Camera size={14} />
            <span>{CAMERA_LABELS[cameraMode]}</span>
          </button>
          <button
            className="hud-pill-btn"
            onClick={() => requestReset(false)}
            title="Resetar carro no último checkpoint (R)"
          >
            <RotateCcw size={14} />
            <span>RESET (R)</span>
          </button>
          <button className="hud-pill-btn accent" onClick={startStage} title="Reiniciar Estágio">
            <span>REINICIAR</span>
          </button>
          <button
            className={`hud-icon-btn ${debugOpen ? 'active' : ''}`}
            onClick={toggleDebug}
            title="Painel Debug / Calibração (H)"
          >
            <SlidersHorizontal size={15} />
          </button>
          <button
            className="hud-icon-btn"
            onClick={() => {
              rallyAudio.init();
              toggleMute();
              rallyAudio.setMuted(!muted);
            }}
            title="Áudio (M)"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button className="hud-icon-btn" onClick={returnToMenu} title="Voltar ao Menu">
            <Home size={15} />
          </button>
        </div>

        {/* Track Minimap */}
        <div className="hud-panel minimap-card">
          <svg viewBox="0 0 160 160" className="minimap-svg">
            <polygon
              points={pathPoints}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="4.5"
              strokeLinejoin="round"
            />
            {checkpoints.map((cp, idx) => (
              <circle
                key={cp.id}
                cx={toMapX(cp.x)}
                cy={toMapY(cp.z)}
                r={idx === nextCheckpointIndex ? 4.8 : idx === 0 ? 4 : 2.3}
                fill={
                  idx === nextCheckpointIndex
                    ? '#f59e0b'
                    : idx === 0
                      ? '#22c55e'
                      : 'rgba(255,255,255,0.45)'
                }
              />
            ))}
            {/* Car Marker */}
            <g
              transform={`translate(${toMapX(hud.carX).toFixed(1)}, ${toMapY(hud.carZ).toFixed(1)}) rotate(${((-hud.carYaw * 180) / Math.PI + 180).toFixed(1)})`}
            >
              <polygon points="0,-6.5 4.5,5.5 0,2.5 -4.5,5.5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
            </g>
          </svg>
        </div>
      </div>

      {/* Center: Countdown or Drift Badge */}
      <div className="hud-center-stage">
        {phase === 'countdown' && (
          <div className="countdown-overlay">
            <div className="countdown-lights">
              <span className={`light ${countdownValue <= 3 ? 'red' : ''}`} />
              <span className={`light ${countdownValue <= 2 ? 'red' : ''}`} />
              <span className={`light ${countdownValue <= 1 ? 'red' : ''}`} />
            </div>
            <div key={countdownValue} className="countdown-number">
              {countdownValue}
            </div>
            <div className="countdown-hint">SEGURE W PARA LARGAR NO GIRO!</div>
          </div>
        )}

        {showGoBanner && (
          <div className="countdown-overlay">
            <div className="countdown-number go">GO!</div>
          </div>
        )}

        {isDrifting && (
          <div className="drift-badge">
            <span>DRIFT</span>
            <strong className="mono">{hud.driftAngleDeg}°</strong>
          </div>
        )}
      </div>

      {/* Bottom Right: Digital Motorsport Tachometer & Speedometer */}
      <div className="hud-bottom-right">
        <div className="hud-panel tacho-panel">
          {/* RPM LED Shift Bar */}
          <div className="rpm-bar-header">
            <span className="micro-label">RPM</span>
            <span className="mono rpm-num">{hud.rpm}</span>
          </div>
          <div className="rpm-led-strip">
            {Array.from({ length: RPM_SEGMENTS }).map((_, i) => {
              const lit = i < litSegments;
              const zone = i >= 19 ? 'red' : i >= 14 ? 'amber' : 'green';
              return (
                <span
                  key={i}
                  className={`rpm-seg ${zone} ${lit ? 'lit' : ''} ${lit && litSegments >= 22 ? 'redline' : ''}`}
                />
              );
            })}
          </div>

          <div className="speed-gear-row">
            <div className="gear-box">
              <span className="micro-label">MARCHA</span>
              <div className={`gear-digit ${hud.gear === -1 ? 'rev' : ''}`}>{gearLabel}</div>
            </div>

            <div className="speed-box">
              <div className="speed-digit mono">{String(hud.speedKmh).padStart(3, '0')}</div>
              <span className="speed-unit">KM/H</span>
            </div>
          </div>

          {/* Pedal & Handbrake Telemetry Strip */}
          <div className="pedal-strip">
            <div className={`pedal-pill ${hud.throttle > 0.1 ? 'gas-on' : ''}`}>GAS</div>
            <div className={`pedal-pill ${hud.brake > 0.1 ? 'brk-on' : ''}`}>FREIO</div>
            <div className={`pedal-pill ${hud.handbrake ? 'hb-on' : ''}`}>H-BRAKE</div>
          </div>
        </div>
      </div>

      {/* Bottom Left: Subtle Key Hints */}
      <div className="hud-bottom-left">
        <div className="key-hint-bar">
          <span><kbd>WASD</kbd> Dirigir</span>
          <span><kbd>ESPAÇO</kbd> Drift</span>
          <span><kbd>C</kbd> Câmera</span>
          <span><kbd>R</kbd> Reset</span>
          <span><kbd>H</kbd> Debug</span>
        </div>
      </div>
    </div>
  );
}

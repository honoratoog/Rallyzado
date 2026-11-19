import { ChevronLeft, ChevronRight, Flag, Play, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../game/store/useGameStore';
import { rallyAudio } from '../game/audio/RallyAudioEngine';
import { formatRaceTime } from './formatTime';

export function StartMenu() {
  const phase = useGameStore((s) => s.phase);
  const carCatalog = useGameStore((s) => s.carCatalog);
  const selectedCarId = useGameStore((s) => s.selectedCarId);
  const selectCar = useGameStore((s) => s.selectCar);
  const startStage = useGameStore((s) => s.startStage);
  const record = useGameStore((s) => s.record);
  const trackLoaded = useGameStore((s) => s.trackLoaded);
  const carLoaded = useGameStore((s) => s.carLoaded);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);

  if (phase !== 'menu') return null;

  const isReady = trackLoaded && carLoaded;
  const currentIdx = Math.max(
    0,
    carCatalog.findIndex((c) => c.id === selectedCarId),
  );
  const activeCar = carCatalog[currentIdx];

  const cycleCar = (dir: -1 | 1) => {
    if (carCatalog.length === 0) return;
    const nextIdx = (currentIdx + dir + carCatalog.length) % carCatalog.length;
    selectCar(carCatalog[nextIdx].id);
  };

  const handlePlay = () => {
    if (!isReady) return;
    rallyAudio.init();
    rallyAudio.setMuted(muted);
    startStage();
  };

  return (
    <div className="menu-overlay">
      <div className="menu-topbar">
        <div className="brand-block">
          <div className="brand-pill">
            <Flag size={13} />
            <span>TIME ATTACK • STAGE 01</span>
          </div>
          <h1 className="brand-title">
            RALLY<span>ZADO</span>
          </h1>
          <p className="brand-sub">DRIFT &amp; RALLY SPECIAL STAGE // AWD PHYSICS</p>
        </div>

        <div className="menu-top-actions">
          {record.bestTimeMs !== null && (
            <div className="record-chip">
              <Trophy size={15} className="accent-amber" />
              <div>
                <span className="chip-label">MELHOR TEMPO</span>
                <strong className="mono">{formatRaceTime(record.bestTimeMs)}</strong>
              </div>
            </div>
          )}
          <button
            className="icon-btn"
            onClick={() => {
              rallyAudio.init();
              toggleMute();
              rallyAudio.setMuted(!muted);
            }}
            title="Alternar Áudio (M)"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </div>

      <div className="menu-bottom-grid">
        {/* Vehicle Selector Card */}
        <div className="glass-card car-selector-card">
          <div className="card-header-row">
            <span className="micro-label">GARAGEM RALLY ({carCatalog.length || 1} CARROS)</span>
            <span className="era-badge">{activeCar?.era ?? 'Carregando...'}</span>
          </div>

          <div className="car-carousel-row">
            <button
              className="nav-arrow-btn"
              onClick={() => cycleCar(-1)}
              disabled={carCatalog.length <= 1}
              aria-label="Carro anterior"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="car-title-wrap">
              <div className="car-name">{activeCar?.name ?? 'Carregando modelo...'}</div>
              <div className="car-specs">
                <span>TRAÇÃO AWD</span>
                <span>•</span>
                <span>6 MARCHAS</span>
                <span>•</span>
                <span>4.2M NORMALIZADO</span>
              </div>
            </div>

            <button
              className="nav-arrow-btn"
              onClick={() => cycleCar(1)}
              disabled={carCatalog.length <= 1}
              aria-label="Próximo carro"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <button
            className={`play-cta ${!isReady ? 'loading' : ''}`}
            onClick={handlePlay}
            disabled={!isReady}
          >
            <Play size={20} fill="currentColor" />
            <span>{isReady ? 'JOGAR ESTÁGIO' : 'CARREGANDO PISTA E CARROS...'}</span>
          </button>
        </div>

        {/* Controls Legend Card */}
        <div className="glass-card controls-card">
          <span className="micro-label">CONTROLES</span>
          <div className="controls-grid">
            <div className="ctrl-item">
              <kbd>W</kbd> <kbd>↑</kbd>
              <span>Acelerar</span>
            </div>
            <div className="ctrl-item">
              <kbd>S</kbd> <kbd>↓</kbd>
              <span>Freio / Ré</span>
            </div>
            <div className="ctrl-item">
              <kbd>A</kbd> <kbd>D</kbd>
              <span>Direção</span>
            </div>
            <div className="ctrl-item">
              <kbd>ESPAÇO</kbd>
              <span>Freio de Mão (Drift)</span>
            </div>
            <div className="ctrl-item">
              <kbd>C</kbd>
              <span>Alternar Câmera</span>
            </div>
            <div className="ctrl-item">
              <kbd>R</kbd>
              <span>Resetar na Pista</span>
            </div>
            <div className="ctrl-item">
              <kbd>H</kbd>
              <span>Calibrar Checkpoints</span>
            </div>
            <div className="ctrl-item">
              <kbd>M</kbd>
              <span>Mutar Áudio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

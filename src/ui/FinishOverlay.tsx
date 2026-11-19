import { Flag, Home, RotateCcw, Trophy } from 'lucide-react';
import { useGameStore } from '../game/store/useGameStore';
import { formatRaceTime } from './formatTime';

export function FinishOverlay() {
  const phase = useGameStore((s) => s.phase);
  const lastFinishTimeMs = useGameStore((s) => s.lastFinishTimeMs);
  const isNewRecord = useGameStore((s) => s.isNewRecord);
  const record = useGameStore((s) => s.record);
  const selectedCarId = useGameStore((s) => s.selectedCarId);
  const carCatalog = useGameStore((s) => s.carCatalog);
  const startStage = useGameStore((s) => s.startStage);
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  if (phase !== 'finished') return null;

  const carName = carCatalog.find((c) => c.id === selectedCarId)?.name ?? selectedCarId;

  return (
    <div className="finish-overlay">
      <div className="glass-card finish-card">
        <div className="finish-badge-row">
          <span className="brand-pill">
            <Flag size={13} />
            ESTÁGIO CONCLUÍDO
          </span>
          {isNewRecord && (
            <span className="record-banner">
              <Trophy size={13} />
              NOVO RECORDE!
            </span>
          )}
        </div>

        <div className="finish-time mono">{formatRaceTime(lastFinishTimeMs)}</div>
        <div className="finish-car">{carName}</div>

        <div className="finish-stats">
          <div className="stat-cell">
            <span className="micro-label">MELHOR TEMPO SALVO</span>
            <strong className="mono">{formatRaceTime(record.bestTimeMs)}</strong>
          </div>
          <div className="stat-cell">
            <span className="micro-label">DIFERENÇA</span>
            <strong className="mono">
              {isNewRecord
                ? 'MELHOR VOLTA'
                : lastFinishTimeMs !== null && record.bestTimeMs !== null
                  ? `+${((lastFinishTimeMs - record.bestTimeMs) / 1000).toFixed(3)}s`
                  : '--'}
            </strong>
          </div>
        </div>

        <div className="finish-actions">
          <button className="play-cta" onClick={startStage}>
            <RotateCcw size={18} />
            <span>CORRER NOVAMENTE</span>
          </button>
          <button className="secondary-cta" onClick={returnToMenu}>
            <Home size={18} />
            <span>GARAGEM / MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
}

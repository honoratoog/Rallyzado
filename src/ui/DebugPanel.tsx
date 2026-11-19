import { useEffect, useState } from 'react';
import {
  Copy,
  Crosshair,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { liveTelemetry, useGameStore } from '../game/store/useGameStore';

export function DebugPanel() {
  const debugOpen = useGameStore((s) => s.debugOpen);
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const checkpoints = useGameStore((s) => s.checkpoints);
  const addCheckpointAtCurrentPose = useGameStore((s) => s.addCheckpointAtCurrentPose);
  const moveCheckpointToCurrentPose = useGameStore((s) => s.moveCheckpointToCurrentPose);
  const updateCheckpointAtIndex = useGameStore((s) => s.updateCheckpointAtIndex);
  const removeCheckpoint = useGameStore((s) => s.removeCheckpoint);
  const persistCheckpoints = useGameStore((s) => s.persistCheckpoints);
  const resetDefaultCheckpoints = useGameStore((s) => s.resetDefaultCheckpoints);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pose, setPose] = useState({
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    grounded: 4,
    drift: 0,
  });

  useEffect(() => {
    if (!debugOpen) return;
    const id = window.setInterval(() => {
      setPose({
        x: liveTelemetry.position[0],
        y: liveTelemetry.position[1],
        z: liveTelemetry.position[2],
        yaw: liveTelemetry.yaw,
        speed: liveTelemetry.speedKmh,
        grounded: liveTelemetry.groundedWheels,
        drift: liveTelemetry.driftAngleDeg,
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [debugOpen]);

  if (!debugOpen) return null;

  const safeIdx = Math.min(selectedIdx, Math.max(0, checkpoints.length - 1));
  const selectedCp = checkpoints[safeIdx];

  const flash = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 2200);
  };

  const handleSave = () => {
    persistCheckpoints();
    flash('Checkpoints salvos no localStorage!');
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(checkpoints, null, 2));
      flash('JSON dos checkpoints copiado!');
    } catch {
      flash('Não foi possível acessar a área de transferência.');
    }
  };

  return (
    <aside className="debug-panel">
      <div className="debug-header">
        <div>
          <span className="micro-label">MODO DEBUG / CALIBRAÇÃO (H)</span>
          <strong>POSICIONAMENTO &amp; CHECKPOINTS</strong>
        </div>
        <button className="hud-icon-btn" onClick={toggleDebug} title="Fechar (H)">
          <X size={15} />
        </button>
      </div>

      {/* Live Vehicle Coordinates */}
      <div className="debug-telemetry-box mono">
        <div>
          <span>X:</span> <strong>{pose.x.toFixed(2)}</strong>
        </div>
        <div>
          <span>Y:</span> <strong>{pose.y.toFixed(2)}</strong>
        </div>
        <div>
          <span>Z:</span> <strong>{pose.z.toFixed(2)}</strong>
        </div>
        <div>
          <span>YAW:</span> <strong>{pose.yaw.toFixed(3)} rad</strong>
        </div>
        <div>
          <span>RODAS:</span> <strong>{pose.grounded}/4</strong>
        </div>
        <div>
          <span>DRIFT:</span> <strong>{pose.drift.toFixed(1)}°</strong>
        </div>
      </div>

      {/* Quick Capture Actions */}
      <div className="debug-btn-row">
        <button
          className="debug-btn primary"
          onClick={() => {
            addCheckpointAtCurrentPose();
            setSelectedIdx(checkpoints.length);
            flash('Novo checkpoint capturado na posição atual!');
          }}
        >
          <Plus size={14} />
          <span>Novo CP Aqui</span>
        </button>

        <button
          className="debug-btn"
          onClick={() => {
            moveCheckpointToCurrentPose(safeIdx);
            flash(`${selectedCp?.name ?? 'CP'} movido para posição atual!`);
          }}
        >
          <Crosshair size={14} />
          <span>Mover Selecionado</span>
        </button>
      </div>

      {/* Checkpoint Selector List */}
      <div className="debug-cp-list">
        {checkpoints.map((cp, idx) => (
          <button
            key={cp.id}
            className={`debug-cp-item ${idx === safeIdx ? 'selected' : ''}`}
            onClick={() => setSelectedIdx(idx)}
          >
            <span className="cp-idx-pill">{idx === 0 ? 'S' : idx}</span>
            <span className="cp-item-name">{cp.name}</span>
            <span className="mono cp-item-coords">
              ({cp.x.toFixed(0)}, {cp.z.toFixed(0)})
            </span>
          </button>
        ))}
      </div>

      {/* Selected Checkpoint Fine Editor */}
      {selectedCp && (
        <div className="debug-editor">
          <div className="debug-editor-row">
            <label>Raio (m)</label>
            <input
              type="number"
              step="0.5"
              min="4"
              max="35"
              value={selectedCp.radius}
              onChange={(e) =>
                updateCheckpointAtIndex(safeIdx, {
                  radius: Number(e.target.value) || 12,
                })
              }
            />
            {safeIdx > 0 && (
              <button
                className="debug-btn danger"
                onClick={() => {
                  removeCheckpoint(safeIdx);
                  setSelectedIdx(Math.max(0, safeIdx - 1));
                  flash('Checkpoint removido.');
                }}
                title="Remover Checkpoint"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Persistence Footer */}
      <div className="debug-btn-row">
        <button className="debug-btn save" onClick={handleSave}>
          <Save size={14} />
          <span>Salvar</span>
        </button>
        <button className="debug-btn" onClick={handleCopyJson}>
          <Copy size={14} />
          <span>Copiar JSON</span>
        </button>
        <button
          className="debug-btn"
          onClick={() => {
            resetDefaultCheckpoints();
            setSelectedIdx(0);
            flash('Traçado padrão restaurado!');
          }}
          title="Restaurar checkpoints padrão"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {statusMsg && <div className="debug-toast">{statusMsg}</div>}
    </aside>
  );
}

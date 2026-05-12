'use client';

/**
 * SpindownModal — guides the rider through a coast-down calibration.
 *
 * Driven entirely by `state.spindown.phase`:
 *   - prompting → instructions + Start button
 *   - running   → "pedale forte / pare de pedalar" instructions + spinner
 *   - success   → green check + dismiss
 *   - error     → orange triangle + retry / dismiss
 */

import { useBleStore } from '@/stores/bleStore';
import { Icons } from '@/components/icons';

export function SpindownModal() {
  const spindown      = useBleStore(s => s.spindown);
  const startSpindown = useBleStore(s => s.startSpindown);
  const closeSpindown = useBleStore(s => s.closeSpindown);

  if (spindown.phase === 'idle') return null;

  const { phase, message } = spindown;

  return (
    <div className="disconnect-overlay" role="dialog" aria-modal="true">
      <div className="disconnect-modal" style={{ maxWidth: 460 }}>
        <div className="disconnect-icon" style={{
          color: phase === 'success' ? 'var(--ok)' :
                 phase === 'error'   ? 'var(--warn)' :
                 'var(--accent)',
        }}>
          {phase === 'success' ? <Icons.CheckCircle size={32}/> :
           phase === 'error'   ? <Icons.Warning size={32}/> :
           <Icons.Settings size={32}/>}
        </div>

        <h2 className="disconnect-title">
          {phase === 'success' ? 'Calibração concluída' :
           phase === 'error'   ? 'Algo deu errado'      :
           'Calibração spindown'}
        </h2>

        <p className="disconnect-sub" style={{ lineHeight: 1.55 }}>
          {phase === 'prompting' && (
            <>
              A calibração mede a resistência interna do seu trainer e ajusta a leitura
              de potência. Faça com o trainer aquecido (≥ 10 min).
              <br/><br/>
              <strong style={{ color: 'var(--fg)' }}>Quando começar:</strong> pedale forte até atingir cerca de
              30 km/h e então pare completamente de pedalar — o trainer registra o tempo
              de desaceleração.
            </>
          )}
          {phase === 'running' && (message || 'Aguardando resposta do trainer…')}
          {phase === 'success' && (message || 'Tudo certo! Sua potência agora reflete a resistência real do trainer.')}
          {phase === 'error'   && message}
        </p>

        <div className="disconnect-actions">
          {phase === 'prompting' && (
            <>
              <button className="btn primary" onClick={startSpindown}>
                Iniciar calibração
              </button>
              <button className="btn" onClick={closeSpindown}>Cancelar</button>
            </>
          )}
          {phase === 'running' && (
            <button className="btn" onClick={closeSpindown}>Cancelar</button>
          )}
          {phase === 'success' && (
            <button className="btn primary" onClick={closeSpindown}>Fechar</button>
          )}
          {phase === 'error' && (
            <>
              <button className="btn primary" onClick={startSpindown}>Tentar de novo</button>
              <button className="btn" onClick={closeSpindown}>Fechar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

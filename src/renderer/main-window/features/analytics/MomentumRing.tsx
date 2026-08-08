import type { Band } from '@shared/analytics.js';
import { Ring } from '../../../shared/components/Ring.js';

/** 180px on Analytics — the largest of the ring's three fixed sizes. */
export function MomentumRing({ value, band }: { value: number; band: Band }): React.JSX.Element {
  return (
    <div style={{ flexShrink: 0, textAlign: 'center' }}>
      <Ring value={value / 100} size={180} band={band.id}>
        <div>
          <div className="mono" style={{ fontSize: 40 }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{band.label}</div>
        </div>
      </Ring>
    </div>
  );
}

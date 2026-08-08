/** A count, never a chain. Cannot be broken, only slowly changed. */
export function ActiveDays({ active, window }: { active: number; window: number }): React.JSX.Element {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
      {active} of the last {window} days active
    </div>
  );
}

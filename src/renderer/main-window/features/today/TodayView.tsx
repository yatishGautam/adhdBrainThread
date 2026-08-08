import { formatLongDate } from '@shared/format.js';
import { useDayStore } from '../../stores/dayStore.js';
import { useThreadStore } from '../../stores/threadStore.js';
import { EmptyState } from '../../../shared/components/EmptyState.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';
import { GettingStarted } from './GettingStarted.js';
import { NowPanel } from './NowPanel.js';
import { PlanPanel } from './PlanPanel.js';
import { ThoughtCapture } from './ThoughtCapture.js';
import { LoggedPanel } from './LoggedPanel.js';

export function TodayView(): React.JSX.Element {
  const today = useDayStore((s) => s.today);
  const viewed = useDayStore((s) => s.viewed);
  const viewedDate = useDayStore((s) => s.viewedDate);
  const threads = useThreadStore((s) => s.threads);

  // Viewing a past date that never happened: an empty read-only state, never a created record.
  const isPast = viewedDate !== null && viewedDate !== today?.localDate;
  const day = isPast ? viewed : today;

  if (isPast && !viewed) {
    return (
      <div style={{ padding: 40 }}>
        <EmptyState
          title="Nothing happened on this day."
          detail="No record was created — and none will be. Days only exist once you use them."
        />
      </div>
    );
  }

  const firstRun = threads.length === 0 && !isPast;

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title={isPast ? formatLongDate(viewedDate) : 'Today'}
        description={
          isPast ? 'A read-only look back at this day.' : 'What you picked for today, and what you got done.'
        }
      />

      {firstRun ? (
        <GettingStarted />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <NowPanel readOnly={isPast} />
            <PlanPanel day={day} readOnly={isPast} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ThoughtCapture day={day} readOnly={isPast} />
            <LoggedPanel day={day} />
          </div>
        </div>
      )}
    </div>
  );
}

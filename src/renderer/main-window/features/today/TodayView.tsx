import { formatLongDate } from '@shared/format.js';
import { useDayStore } from '../../stores/dayStore.js';
import { PageHeader } from '../../../shared/components/PageHeader.js';
import { NowSection } from './NowSection.js';
import { PlanSection } from './PlanSection.js';
import { TodayThreads } from './TodayThreads.js';
import { TodoList } from './TodoList.js';
import { BlockerList } from './BlockerList.js';
import { LogSection } from './LogSection.js';
import { ThoughtCapture } from './ThoughtCapture.js';

/**
 * The daily page, in the fixed order §3 sets: NOW, today's threads, to-do, blockers, log, park,
 * meeting notes. One column, always the same shape, so there is only one layout to remember.
 *
 * Every day is editable, not just today. A day that has no record yet is not an error and not
 * an empty read-only screen — it is a blank page you can write on, and writing anything at all
 * (a to-do, a log line, a note) is what brings it into existence and puts it in the navigator.
 * Threads are not required: plenty of days are just a couple of reminders.
 */
export function TodayView(): React.JSX.Element {
  const today = useDayStore((s) => s.today);
  const todayDate = useDayStore((s) => s.todayDate);
  const viewed = useDayStore((s) => s.viewed);
  const viewedDate = useDayStore((s) => s.viewedDate);

  const isPast = viewedDate !== null && viewedDate !== todayDate;
  const day = isPast ? viewed : today;
  const localDate = isPast ? (viewedDate as string) : todayDate;

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 820, margin: '0 auto' }}>
      <PageHeader
        title={isPast ? formatLongDate(localDate) : 'Today'}
        description={
          isPast
            ? 'Anything you add here is filed under this day. To-dos and blockers show where they stand now.'
            : 'What you are on right now, and what the day turns into.'
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <NowSection day={day} localDate={localDate} />
        <PlanSection localDate={localDate} />
        <TodayThreads readOnly={false} />
        <TodoList localDate={localDate} />
        <BlockerList localDate={localDate} />
        <LogSection day={day} localDate={localDate} />
        <ThoughtCapture day={day} localDate={localDate} />
      </div>
    </div>
  );
}

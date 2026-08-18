import { SideRail } from './SideRail.js';
import { TabBar } from './TabBar.js';
import { useUiStore } from '../stores/uiStore.js';
import { TodayView } from '../features/today/TodayView.js';
import { ThreadsView } from '../features/threads/ThreadsView.js';
import { AnalyticsView } from '../features/analytics/AnalyticsView.js';
import { ParkView } from '../features/park/ParkView.js';
import { AccountPanel } from '../features/account/AccountPanel.js';

export function Shell(): React.JSX.Element {
  const tab = useUiStore((s) => s.tab);

  return (
    <div className="app-bg" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SideRail />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <TabBar />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'today' ? <TodayView /> : null}
          {tab === 'threads' ? <ThreadsView /> : null}
          {tab === 'analytics' ? <AnalyticsView /> : null}
          {tab === 'park' ? <ParkView /> : null}
        </div>
      </div>
      <AccountPanel />
    </div>
  );
}

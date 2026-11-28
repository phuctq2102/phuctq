import React, { useState } from 'react';
import Dashboard from './Dashboard';
import RecapDashboard from './RecapDashboard';
import DashboardDsclImport from './DashboardDsclImport';
import { Button } from './components/ui/button';

export default function InventoryDashboard({ syncRevision }) {
  const [view, setView] = useState('all');
  const [previousView, setPreviousView] = useState('all');
  const [scope, setScope] = useState(null);
  const [working, setWorking] = useState(false);
  const [dsclRevision, setDsclRevision] = useState(0);

  function openPeriod(row) {
    setScope({ ma_ch: row.ma_ch, ngay_moi: row.ngay_moi, ten_ch: row.ten_ch });
    if (view !== 'store') setPreviousView(view);
    setWorking(false);
    setView('store');
    window.scrollTo(0, 0);
  }

  return <>
    <nav className="inventory-dashboard-tabs" aria-label="Phạm vi Dashboard">
      {[['store', '1 CH'], ['manager', 'QLKV'], ['director', 'GĐV'], ['all', 'Toàn bộ']].map(([key,label]) =>
        <Button key={key} type="button" variant={view === key ? 'default' : 'outline'} aria-pressed={view === key} onClick={() => {
          if (key === 'store') { setScope(null); setWorking(false); }
          setView(key);
        }}>{label}</Button>)}
      {view === 'store' && !scope && <Button type="button" variant="outline" onClick={() => setWorking(value => !value)}>{working ? 'Chọn kỳ trong Lịch KK' : 'Xem DSCL đang làm việc'}</Button>}
      {view === 'store' && scope && <Button type="button" variant="outline" onClick={() => setView(previousView)}>Quay lại RECAP</Button>}
    </nav>
    <DashboardDsclImport onSaved={() => setDsclRevision(value => value + 1)}/>
    <div hidden={view === 'store' && (!!scope || working)}>
      <RecapDashboard syncRevision={syncRevision} dsclRevision={dsclRevision} mode={view === 'store' && scope ? previousView : view} onOpenPeriod={openPeriod}/>
    </div>
    {view === 'store' && (scope || working) && <Dashboard key={scope ? `${scope.ma_ch}|${scope.ngay_moi}` : 'working'} syncRevision={syncRevision + dsclRevision} scope={scope}/>}
  </>;
}

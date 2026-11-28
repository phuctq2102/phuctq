import React, { useState } from 'react';
import Dashboard from './Dashboard';
import RecapDashboard from './RecapDashboard';
import DashboardDsclImport from './DashboardDsclImport';

export default function InventoryDashboard({ syncRevision }) {
  const [workingOpen, setWorkingOpen] = useState(false);
  const [dsclRevision, setDsclRevision] = useState(0);

  return <div className="dashboard-view">
    <DashboardDsclImport onSaved={() => setDsclRevision(value => value + 1)}/>
    <RecapDashboard syncRevision={syncRevision} dsclRevision={dsclRevision}/>
    <details className="panel" onToggle={event => setWorkingOpen(event.currentTarget.open)}>
      <summary>DSCL đang làm việc</summary>
      {workingOpen && <Dashboard syncRevision={syncRevision}/>}
    </details>
  </div>;
}

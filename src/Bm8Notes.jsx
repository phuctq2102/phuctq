import React, { useState } from 'react';
import { bm8Fields, fillBm8Workbook } from './bm8Workbook';

export default function Bm8Notes() {
  const [template, setTemplate] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function download() {
    setBusy(true);
    setStatus('');
    try {
      const bytes = fillBm8Workbook(new Uint8Array(await template.arrayBuffer()), notes);
      const file = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = template.name.replace(/\.xlsx$/i, '') + ' - BM8 đã điền.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus('Đã tạo bản Excel có nội dung ghi nhận BM8.');
    } catch (error) {
      setStatus(error.message || 'Không tạo được file biên bản.');
    } finally {
      setBusy(false);
    }
  }

  return <details>
    <summary>Biên bản BM8 · Nội dung ghi nhận kiểm kê</summary>
    <p>Chọn workbook mẫu có sheet BM8. Các dòng để trống giữ nội dung mẫu.</p>
    <label>File mẫu BM8
      <input type="file" accept=".xlsx" disabled={busy}
        onChange={event => { setTemplate(event.target.files[0] ?? null); setStatus(''); }}/>
    </label>
    <div className="clkk-grid">
      {bm8Fields.map(({ cell, label }) => <label key={cell}>{label}
        <input type="text" value={notes[cell] ?? ''} disabled={busy}
          onChange={event => setNotes({ ...notes, [cell]: event.target.value })}/>
      </label>)}
    </div>
    <button type="button" disabled={busy || !template || !bm8Fields.some(({ cell }) => notes[cell]?.trim())}
      onClick={download}>{busy ? 'Đang tạo Excel…' : 'Tải biên bản BM8 Excel'}</button>
    {status && <p role="status">{status}</p>}
  </details>;
}

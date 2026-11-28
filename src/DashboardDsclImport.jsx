import React, { useState } from 'react';
import { supabase } from './supabase';
import { readClkkSchedules } from './clkkQueries';
import { parseDashboardDscl } from './upload';

export default function DashboardDsclImport({ onSaved }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function preview(file) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    setDraft(null);
    try {
      const groups = await parseDashboardDscl(file);
      const schedules = new Map(groups.map(row => [row.ma_ch, []]));
      const codes = [...schedules.keys()];
      for (let offset = 0; offset < codes.length; offset += 100) {
        for (const row of await readClkkSchedules(codes.slice(offset, offset + 100))) {
          schedules.get(row.ma_ch)?.push(row.ngay_moi);
        }
      }
      setDraft({ name: file.name, groups: groups.map(row => {
        const days = schedules.get(row.ma_ch);
        return { ...row, days, day: days.length === 1 ? days[0] : '' };
      }) });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !draft) return;
    const ready = draft.groups.filter(group => group.day);
    if (!ready.length) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.from('v10_dashboard_dscl').upsert(
        ready.map(row => ({ ma_ch: row.ma_ch, ngay_moi: row.day, dong: row.dong })),
        { onConflict: 'ma_ch,ngay_moi' },
      );
      if (error) throw error;
      const pending = draft.groups.filter(group => !group.day);
      setDraft(pending.length ? { ...draft, groups: pending } : null);
      setMessage(`Đã lưu DSCL cho ${ready.map(row => row.ma_ch).join(', ')}.${pending.length ? ` Còn ${pending.length} CH chờ lịch hoặc chọn kỳ.` : ''}`);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <details className="panel">
    <summary>Nhập DSCL ngày D cho Dashboard</summary>
    <p>File có thể chứa nhiều mã CH trong cột Nhà máy. Gắn từng CH với ngày kiểm kê dự kiến trong Lịch KK.</p>
    <label>File DSCL <input type="file" accept=".xls,.xlsx" disabled={busy}
      onChange={event => { preview(event.target.files[0]); event.target.value = ''; }}/></label>
    {draft && <>
      <p>{draft.name} · {draft.groups.length} cửa hàng. Tải lại cùng mã CH và ngày sẽ cập nhật DSCL của kỳ đó.</p>
      <div className="clkk-grid">{draft.groups.map(group => <label key={group.ma_ch}>
        {group.ma_ch} · {group.dong.length} dòng
        {group.days.length ? <select value={group.day} disabled={busy} onChange={event => setDraft({
          ...draft, groups: draft.groups.map(row => row.ma_ch === group.ma_ch ? { ...row, day: event.target.value } : row),
        })}>
          <option value="">Chọn ngày dự kiến</option>
          {group.days.map(day => <option key={day} value={day}>{day.split('-').reverse().join('/')}</option>)}
        </select> : <span>Chưa có mã CH trong Lịch KK.</span>}
      </label>)}</div>
      <button type="button" disabled={busy || !draft.groups.some(row => row.day)} onClick={save}>Lưu DSCL cho các kỳ đã chọn</button>
    </>}
    {message && <p role="status">{message}</p>}
  </details>;
}

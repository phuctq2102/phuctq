import React, { useState } from 'react';
import { supabase } from './supabase';
import { parseIndustryWorkbook } from './industry';
import { Button } from './components/ui/button';

export default function IndustryImport({ onSaved }) {
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setEntries([]);
    setMessage('');
    try {
      setEntries(parseIndustryWorkbook(await file.arrayBuffer()));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.from('v10_nganh_hang').upsert(entries, { onConflict: 'ma_nhom' });
      if (error) throw error;
      setMessage('Đã cập nhật ' + entries.length + ' mã ngành hàng.');
      setEntries([]);
      onSaved();
    } catch (error) {
      setMessage('Không lưu được danh mục: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="importpanel-inner">
    <h2>Cập nhật danh mục ngành hàng</h2>
    <p>Chọn file Excel có cột MCH3_ID và MCH3_Desc. Mã đã có sẽ được cập nhật tên.</p>
    <input aria-label="Chọn file danh mục ngành hàng" type="file" accept=".xlsx,.xls" disabled={busy} onChange={chooseFile}/>
    {entries.length > 0 && <>
      <p>{entries.length} mã hợp lệ · {entries.slice(0, 3).map(row => row.ma_nhom + ' · ' + row.ten_nganh).join(' / ')}</p>
      <div><Button type="button" disabled={busy} onClick={save}>Lưu danh mục</Button></div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}

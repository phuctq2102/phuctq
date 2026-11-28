import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './dashboard.css';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = value => value == null ? 'N/A' : money.format(value);
const ratio = (value, revenue) => value != null && Number(revenue) ? percent.format(value / revenue) : 'N/A';
const date = value => value.split('-').reverse().join('/');
const tone = value => value < 0 ? 'negative' : value > 0 ? 'positive' : '';

export default function RecapDashboard({ syncRevision }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()));
  const [allPeriods, setAllPeriods] = useState(false);
  const [by, setBy] = useState('gdv');
  const [groupName, setGroupName] = useState('');
  const [frame, setFrame] = useState(null);
  const scope = allPeriods ? 'all' : month;

  useEffect(() => {
    if (!scope) return;
    let active = true;
    async function load() {
      setFrame(null);
      try {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.rpc('v10_clkk_recap', { p_month: scope === 'all' ? null : scope + '-01' })
            .order('ngay_moi', { ascending: false }).order('gdv').order('ma_ch').range(offset, offset + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) break;
        }
        if (active) setFrame({ scope, rows });
      } catch (error) {
        if (active) setFrame({ scope, error: error.message });
      }
    }
    load();
    return () => { active = false; };
  }, [scope, syncRevision]);

  const rows = frame?.scope === scope ? frame.rows ?? [] : [];
  const labelFor = row => by === 'gdv' ? row.gdv : `${row.qlkv} · ${row.gdv}`;
  const names = [...new Set(rows.map(labelFor))].sort((a, b) => a.localeCompare(b, 'vi'));
  const groups = new Map();
  for (const row of rows) {
    const name = labelFor(row);
    if (groupName && name !== groupName) continue;
    const key = JSON.stringify([row.ngay_moi, name]);
    if (!groups.has(key)) groups.set(key, { name, day: row.ngay_moi, stores: [] });
    groups.get(key).stores.push(row);
  }

  return <div className="dashboard-view">
    <section className="panel dashboard-panel">
      <h2>RECAP các kỳ kiểm kê</h2>
      <div className="dashboard-controls">
        <label>Tháng kiểm kê<input type="month" disabled={allPeriods} value={month} onChange={event => { setMonth(event.target.value); setGroupName(''); }}/></label>
        <label><input type="checkbox" checked={allPeriods} onChange={event => { setAllPeriods(event.target.checked); setGroupName(''); }}/> Toàn bộ kỳ</label>
        <label>Nhóm theo<select value={by} onChange={event => { setBy(event.target.value); setGroupName(''); }}>
          <option value="gdv">GĐV</option><option value="qlkv">QLKV</option>
        </select></label>
        <label>Lọc {by === 'gdv' ? 'GĐV' : 'QLKV'}<select value={groupName} onChange={event => setGroupName(event.target.value)}>
          <option value="">Tất cả</option>{names.map(name => <option key={name}>{name}</option>)}
        </select></label>
      </div>
      <p className="dashboard-caption">Các kỳ được tách theo ngày kiểm kê. Tỷ lệ là tổng CLKK chia tổng doanh thu của các cửa hàng đủ dữ liệu. Ngày D tạm tính bằng 0.</p>
      {scope && frame?.scope !== scope && <p role="status">Đang tải RECAP…</p>}
      {frame?.scope === scope && frame.error && <p role="alert">{frame.error}</p>}
      {frame?.scope === scope && frame.rows && !groups.size && <p>Chưa có lịch kiểm kê phù hợp.</p>}
    </section>
    {[...groups.values()].map(({ name, day, stores }) => {
      const complete = stores.filter(row => row.tinh_trang == null && row.clkk != null && row.doanh_thu != null);
      const withHcxl = stores.filter(row => row.hcxl != null);
      const amount = complete.length ? complete.reduce((total, row) => total + Number(row.clkk), 0) : null;
      const revenue = complete.length ? complete.reduce((total, row) => total + Number(row.doanh_thu), 0) : null;
      const hcxl = withHcxl.length ? withHcxl.reduce((total, row) => total + Number(row.hcxl), 0) : null;
      return <section className="panel dashboard-panel" key={JSON.stringify([day, name])}>
        <h2>{name} · {date(day)}</h2>
        <p className="dashboard-caption">{complete.length}/{stores.length} cửa hàng có đủ dữ liệu CLKK · {withHcxl.length}/{stores.length} cửa hàng có giá trị HCXL.</p>
        <div className="inv-kpis dashboard-kpis">
          <div><small>Tổng CLKK MCH3 (không Fresh)</small><strong className={tone(amount)}>{fmt(amount)}</strong></div>
          <div><small>Doanh thu không Fresh</small><strong>{fmt(revenue)}</strong></div>
          <div><small>Tỷ lệ CLKK / doanh thu</small><strong className={tone(amount)}>{ratio(amount, revenue)}</strong></div>
          <div><small>Tổng HCXL</small><strong>{hcxl == null ? 'Chưa có' : fmt(hcxl)}</strong></div>
        </div>
        <div className="tablewrap dashboard-scroll"><table>
          <thead><tr>{['Cửa hàng','CLKK MCH3','Doanh thu','Tỷ lệ','HCXL','Trạng thái CLKK'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{stores.map(row => <tr key={row.ma_ch}>
            <th scope="row">{row.ma_ch} · {row.ten_ch}</th><td className={tone(row.clkk)}>{fmt(row.clkk)}</td><td>{fmt(row.doanh_thu)}</td><td>{ratio(row.clkk, row.doanh_thu)}</td><td>{row.hcxl == null ? 'Chưa có' : fmt(row.hcxl)}</td><td>{row.tinh_trang ?? 'Đủ dữ liệu'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </div>;
}

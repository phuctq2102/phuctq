import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = value => value == null ? 'N/A' : money.format(value);
const ratio = (value, revenue) => value != null && Number(revenue) ? percent.format(value / revenue) : 'N/A';
const date = value => value.split('-').reverse().join('/');
const tone = value => value < 0 ? 'negative' : value > 0 ? 'positive' : '';

export default function GdvDashboard({ syncRevision }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()));
  const [director, setDirector] = useState('');
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    if (!month) return;
    let active = true;
    async function load() {
      setFrame(null);
      try {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.rpc('v10_clkk_gdv', { p_month: month + '-01' })
            .order('ngay_moi', { ascending: false }).order('gdv').order('ma_ch').range(offset, offset + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) break;
        }
        if (active) setFrame({ month, rows });
      } catch (error) {
        if (active) setFrame({ month, error: error.message });
      }
    }
    load();
    return () => { active = false; };
  }, [month, syncRevision]);

  const rows = frame?.month === month ? frame.rows ?? [] : [];
  const directors = [...new Set(rows.map(row => row.gdv))].sort((a, b) => a.localeCompare(b, 'vi'));
  const groups = new Map();
  for (const row of rows) {
    if (director && row.gdv !== director) continue;
    const key = JSON.stringify([row.ngay_moi, row.gdv]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return <div className="dashboard-view">
    <section className="panel dashboard-panel">
      <h2>Tổng hợp kiểm kê theo GĐV</h2>
      <div className="dashboard-controls">
        <label>Tháng kiểm kê<input type="month" value={month} onChange={event => { setMonth(event.target.value); setDirector(''); }}/></label>
        <label>Giám đốc vùng<select value={director} onChange={event => setDirector(event.target.value)}>
          <option value="">Tất cả GĐV</option>{directors.map(name => <option key={name}>{name}</option>)}
        </select></label>
      </div>
      <p className="dashboard-caption">Mỗi ngày kiểm kê có một tổng riêng cho từng GĐV. Tỉ lệ tính trên các cửa hàng có đủ CLKK và doanh thu. Số liệu SAP theo tháng, ngày D tạm tính bằng 0.</p>
      {month && frame?.month !== month && <p role="status">Đang tải dữ liệu GĐV…</p>}
      {frame?.month === month && frame.error && <p role="alert">{frame.error}</p>}
      {frame?.month === month && frame.rows && !groups.size && <p>Chưa có lịch kiểm kê phù hợp.</p>}
    </section>
    {[...groups.values()].map(group => {
      const [{ gdv, ngay_moi: day }] = group;
      const complete = group.filter(row => row.tinh_trang == null && row.clkk != null && row.doanh_thu != null);
      const amount = complete.length ? complete.reduce((total, row) => total + Number(row.clkk), 0) : null;
      const revenue = complete.length ? complete.reduce((total, row) => total + Number(row.doanh_thu), 0) : null;
      return <section className="panel dashboard-panel" key={JSON.stringify([day, gdv])}>
        <h2>{gdv} · {date(day)}</h2>
        <p className="dashboard-caption">{complete.length}/{group.length} cửa hàng có đủ dữ liệu để tính tổng.</p>
        <div className="inv-kpis dashboard-kpis">
          <div><small>Tổng CLKK MCH3 (không Fresh)</small><strong className={tone(amount)}>{fmt(amount)}</strong></div>
          <div><small>Doanh thu không Fresh</small><strong>{fmt(revenue)}</strong></div>
          <div><small>Tỉ lệ CLKK / doanh thu</small><strong className={tone(amount)}>{ratio(amount, revenue)}</strong></div>
        </div>
        <div className="tablewrap dashboard-scroll"><table>
          <thead><tr>{['Cửa hàng','CLKK MCH3','Doanh thu','Tỉ lệ','Trạng thái'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{group.map(row => <tr key={row.ma_ch}>
            <th scope="row">{row.ma_ch} · {row.ten_ch}</th><td className={tone(row.clkk)}>{fmt(row.clkk)}</td><td>{fmt(row.doanh_thu)}</td><td>{ratio(row.clkk, row.doanh_thu)}</td><td>{row.tinh_trang ?? 'Đủ dữ liệu'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </div>;
}

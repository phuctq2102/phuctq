import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChartNoAxesCombined, PackageSearch } from 'lucide-react';
import { supabase } from './supabase';
import { prepareRecapRows, recapInsights, recapLossRate, recapRowKey, sortRecapRows } from './recapData';
import './dashboard.css';
import './recapDashboard.css';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const percentage = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('vi-VN');
const fmt = value => value == null ? 'N/A' : money.format(value);
const date = value => value.split('-').reverse().join('/');
const normalize = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('đ', 'd').trim();
const pageSize = 25;

export default function RecapDashboard({ syncRevision }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()));
  const [allPeriods, setAllPeriods] = useState(false);
  const [director, setDirector] = useState('');
  const [manager, setManager] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [order, setOrder] = useState('date');
  const [page, setPage] = useState(1);
  const [highlight, setHighlight] = useState('');
  const [frame, setFrame] = useState(null);
  const tableRef = useRef(null);
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
            .order('ngay_moi', { ascending: false }).order('ma_ch').range(offset, offset + 499);
          if (!active) return;
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) break;
        }
        setFrame({ scope, rows: prepareRecapRows(rows) });
      } catch (error) {
        if (active) setFrame({ scope, error: error.message });
      }
    }
    load();
    return () => { active = false; };
  }, [scope, syncRevision]);

  const rows = frame?.scope === scope ? frame.rows ?? [] : [];
  const options = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'vi'));
  const directors = options(rows.map(row => row.gdv));
  const managers = options(rows.filter(row => !director || row.gdv === director).map(row => row.qlkv));
  const filtered = useMemo(() => {
    const term = normalize(search);
    return rows.filter(row => (!director || row.gdv === director) && (!manager || row.qlkv === manager)
      && (!term || normalize(`${row.ma_ch} ${row.ten_ch}`).includes(term))
      && (status === 'all' || (status === 'complete' && row.complete)
        || (status === 'missing' && row.tinh_trang === 'Thiếu dữ liệu SAP')
        || (status === 'exceeds' && row.exceeds)));
  }, [rows, director, manager, search, status]);
  const ranked = useMemo(() => sortRecapRows(filtered, order), [filtered, order]);
  const insights = useMemo(() => recapInsights(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(ranked.length / pageSize));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * pageSize;

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
    setHighlight('');
  }

  function drillDown(row) {
    const key = recapRowKey(row);
    const index = ranked.findIndex(item => recapRowKey(item) === key);
    setPage(Math.floor(index / pageSize) + 1);
    setHighlight(key);
  }

  useEffect(() => {
    if (highlight) tableRef.current?.querySelector('.recap-highlight')?.scrollIntoView({ block: 'center' });
  }, [highlight, currentPage]);

  const signals = [
    { label: 'CLKK âm lớn nhất', row: insights.largestLoss, value: fmt(insights.largestLoss?.clkk), Icon: ChartNoAxesCombined },
    { label: 'Tỷ lệ CLKK âm cao nhất', row: insights.highestRatio, value: insights.highestRatio ? percentage.format(insights.highestRatio.ratio) : 'N/A', Icon: AlertTriangle },
    { label: 'HCXL cao nhất', row: insights.highestHcxl, value: fmt(insights.highestHcxl?.hcxl), Icon: PackageSearch },
  ];

  return <div className="dashboard-view recap-view">
    <section className="dashboard-hero recap-hero">
      <div><h2>RECAP kiểm kê</h2><p className="dashboard-period-context"><CalendarDays size={16} aria-hidden="true"/>{allPeriods ? 'Toàn bộ kỳ' : month ? `Tháng ${month.split('-').reverse().join('/')}` : 'Chọn tháng kiểm kê'}</p></div>
      <div className="recap-stats">
        {[
          ['Cửa hàng có lịch', insights.stores],
          ['Kỳ kiểm kê', filtered.length],
          ['Kỳ đủ dữ liệu CLKK', insights.complete],
          [`Kỳ vượt định mức ${percentage.format(recapLossRate)}`, insights.exceeds],
        ].map(([label, value]) => <div key={label}><small>{label}</small><strong>{frame?.rows ? number.format(value) : '—'}</strong></div>)}
      </div>
    </section>
    <section className="panel dashboard-panel">
      <h2>Bộ lọc</h2>
      <div className="recap-filters">
        <label>Tháng kiểm kê<input type="month" disabled={allPeriods} value={month} onChange={e => { changeFilter(setMonth, e.target.value); setDirector(''); setManager(''); }}/></label>
        <label className="recap-check"><input type="checkbox" checked={allPeriods} onChange={e => { changeFilter(setAllPeriods, e.target.checked); setDirector(''); setManager(''); }}/> Toàn bộ kỳ</label>
        <label>GĐV<select value={director} onChange={e => { changeFilter(setDirector, e.target.value); setManager(''); }}><option value="">Tất cả GĐV</option>{directors.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>QLKV<select value={manager} onChange={e => changeFilter(setManager, e.target.value)}><option value="">Tất cả QLKV</option>{managers.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Tìm cửa hàng<input type="search" placeholder="Mã SAP hoặc tên cửa hàng" value={search} onChange={e => changeFilter(setSearch, e.target.value)}/></label>
        <label>Trạng thái<select value={status} onChange={e => changeFilter(setStatus, e.target.value)}>
          <option value="all">Tất cả trạng thái</option><option value="complete">Đủ dữ liệu CLKK</option><option value="missing">Thiếu dữ liệu SAP</option><option value="exceeds">Vượt định mức</option>
        </select></label>
      </div>
      {scope && frame?.scope !== scope && <p role="status">Đang tải RECAP…</p>}
      {frame?.scope === scope && frame.error && <p role="alert">{frame.error}</p>}
    </section>
    {frame?.rows && <>
      <section className="panel dashboard-panel">
        <h2>Điểm cần chú ý</h2>
        {insights.missingSap > 0 && <p className="recap-gap"><strong>{number.format(insights.missingSap)} kỳ thiếu SAP.</strong> Bổ sung CLKK và doanh thu theo tháng cho các mã SAP tương ứng.{' '}
          <button type="button" onClick={() => changeFilter(setStatus, 'missing')}>Xem kỳ thiếu SAP</button>
        </p>}
        <div className="recap-insights">
          {signals.map(({ label, row, value, Icon }) => <article key={label}>
            <small><Icon size={16} aria-hidden="true"/>{label}</small>
            <strong>{row ? value : '—'}</strong>
            {row && <><p>{row.ma_ch} · {row.ten_ch} · {date(row.ngay_moi)}</p><button type="button" onClick={() => drillDown(row)}>Xem kỳ này</button></>}
          </article>)}
        </div>
      </section>
      <section className="panel dashboard-panel" ref={tableRef}>
        <div className="dashboard-section-heading">
          <h2>Chi tiết cửa hàng và kỳ kiểm kê</h2>
          <label>Sắp xếp <select value={order} onChange={e => changeFilter(setOrder, e.target.value)}>
            <option value="date">Ngày kiểm kê mới nhất</option>
            <option value="clkk">CLKK âm lớn nhất</option>
            <option value="ratio">Tỷ lệ âm cao nhất</option>
            <option value="hcxl">HCXL cao nhất</option>
          </select></label>
        </div>
        <p className="dashboard-caption">Một dòng cho mỗi mã SAP và ngày kiểm kê. Tỷ lệ là CLKK không Fresh chia doanh thu không Fresh của kỳ. Ngày D tạm tính bằng 0.</p>
        {ranked.length ? <>
          <div className="tablewrap recap-table-scroll"><table className="recap-table">
            <thead><tr>{['Cửa hàng','Ngày kiểm kê','GĐV','QLKV','CLKK MCH3','Doanh thu','Tỷ lệ','HCXL','Trạng thái'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{ranked.slice(offset, offset + pageSize).map(row => <tr key={recapRowKey(row)} className={highlight === recapRowKey(row) ? 'recap-highlight' : undefined}>
              <th scope="row"><strong>{row.ma_ch}</strong><small>{row.ten_ch}</small></th>
              <td>{date(row.ngay_moi)}</td><td>{row.gdv}</td><td>{row.qlkv}</td>
              <td className={Number(row.clkk) < 0 ? 'negative' : undefined}>{fmt(row.clkk)}</td>
              <td>{fmt(row.doanh_thu)}</td>
              <td className={row.exceeds ? 'negative' : undefined}>{row.ratio == null ? 'N/A' : percentage.format(row.ratio)}</td>
              <td>{row.hcxl == null ? 'Chưa có' : fmt(row.hcxl)}</td>
              <td><span className={`recap-status ${row.complete && !row.exceeds ? 'recap-ok' : 'recap-review'}`}>{row.tinh_trang ?? (row.exceeds ? 'Vượt định mức' : 'Đủ dữ liệu')}</span></td>
            </tr>)}</tbody>
          </table></div>
          <div className="recap-pagination">
            <span>{number.format(offset + 1)}–{number.format(Math.min(offset + pageSize, ranked.length))} / {number.format(ranked.length)} kỳ</span>
            <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>{' '}
              <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div>
          </div>
        </> : <p>Không có kỳ kiểm kê phù hợp với bộ lọc.</p>}
      </section>
    </>}
  </div>;
}

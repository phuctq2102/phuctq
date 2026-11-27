import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, FileSpreadsheet, Wallet, TrendingDown, Percent, CalendarDays, CircleAlert } from 'lucide-react';
import { supabase } from './supabase';
import { Button } from './components/ui/button';
import { summarizeInventory } from './dashboardData';
import { summarizeClkk, summarizePeriodCategories } from './clkkData';
import { periodKey, readClkkGroups, readClkkPeriods } from './clkkQueries';
import './dashboard.css';
import { saveDashboardSnapshot } from './dashboardSnapshot';
import { exportDashboard } from './dashboardExport';

const integer = new Intl.NumberFormat('vi-VN');
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const money = value => currency.format(Math.abs(value) < 0.5 ? 0 : value);

const lossRate = 0.003;
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value.split('-').reverse().join('/');
const tone = value => value < 0 ? 'negative' : value > 0 ? 'positive' : '';

function Readout({ label, value, format = money }) {
  return <div><small>{label}</small><strong className={tone(value)}>{value == null ? 'N/A' : format(value)}</strong></div>;
}

async function readPages(table, fields, key = 'id') {
  const pageSize = 500;
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from(table).select(fields).order(key).range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

function DiscrepancyMetrics({ summary }) {
  const net = summary.net ?? summary.positive + summary.negative;
  const metrics = [
    ['Mã sản phẩm', integer.format(summary.productCount), ''],
    ['Tổng lệch âm', money(summary.negative), 'negative'],
    ['Tổng lệch dương', money(summary.positive), 'positive'],
    ['Chênh lệch ròng', money(net), net < 0 ? 'negative' : net > 0 ? 'positive' : ''],
  ];

  return <div className="inv-kpis dashboard-kpis">
    {metrics.map(([label, value, tone]) => (
      <div key={label}><small>{label}</small><strong className={tone}>{value}</strong></div>
    ))}
  </div>;
}

function ProductRanking({ title, rows, direction }) {
  const Icon = direction === 'negative' ? ArrowDownRight : ArrowUpRight;
  return <section className="panel dashboard-panel">
    <h2><Icon size={19} aria-hidden="true"/> {title}</h2>
    {rows.length ? <ol className="dashboard-ranking">
      {rows.map((row, index) => <li key={row.code} className={`dashboard-product-card ${direction}`}>
        <div className="dashboard-card-heading"><span className="dashboard-rank-number">{String(index + 1).padStart(2, '0')}</span><small>{direction === 'negative' ? 'Lệch âm' : 'Lệch dương'}</small></div>
        <div className="dashboard-product-name"><strong>{row.name || row.code}</strong>{row.name && <small>{row.code}</small>}</div>
        <strong className={`dashboard-card-value ${direction}`}>{money(row.value)}</strong>
        <dl className="dashboard-quantities">
          <div><dt>SL đếm</dt><dd>{integer.format(row.counted)}</dd></div>
          <div><dt>SL trên sổ</dt><dd>{integer.format(row.book)}</dd></div>
          <div><dt>SL chênh lệch</dt><dd className={row.counted < row.book ? 'negative' : row.counted > row.book ? 'positive' : ''}>{integer.format(row.counted - row.book)}</dd></div>
        </dl>
      </li>)}
    </ol> : <p className="empty">Không có mã phù hợp.</p>}
  </section>;
}

export default function Dashboard() {
  const dashboardRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [industry, setIndustry] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [exportError, setExportError] = useState('');
  const [error, setError] = useState('');
  const [dates, setDates] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [periodResult, setPeriodResult] = useState(null);
  const [periodError, setPeriodError] = useState('');
  const [periodsBusy, setPeriodsBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setPeriodsBusy(true);
    setPeriodError('');
    setDates(null);
    readClkkPeriods().then(result => {
      if (!active) return;
      setDates(result);
      setSelectedPeriod(previous => result.schedules.some(row => periodKey(row) === previous)
        ? previous : result.schedules.length === 1 ? periodKey(result.schedules[0]) : '');
    }).catch(error => {
      if (active) setPeriodError(error.message);
    }).finally(() => {
      if (active) setPeriodsBusy(false);
    });
    return () => { active = false; };
  }, [refresh]);

  const period = dates?.schedules.find(row => periodKey(row) === selectedPeriod);
  const sameMonth = period && period.ngay_cu.slice(0, 7) === period.ngay_moi.slice(0, 7);

  useEffect(() => {
    let active = true;
    if (!period || sameMonth) return;
    readClkkGroups(period).then(rows => {
      if (active) setPeriodResult({ period, summary: summarizeClkk(rows, period, lossRate), categories: summarizePeriodCategories(rows, period, lossRate) });
    }).catch(error => {
      if (active) setPeriodResult({ period, error: error.message });
    });
    return () => { active = false; };
  }, [period, sameMonth]);

  const result = period && periodResult?.period === period ? periodResult : null;
  const totals = result?.summary;
  const isPeriodLoading = periodsBusy || Boolean(period && !sameMonth && !result);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    Promise.all([
      readPages('dscl', 'ma_sp,ten_sp,nhom_vat_tu,gt_chenh_lech,sl_dem,sl_so'),
      readPages('v10_nganh_hang', 'ma_nhom,ten_nganh,ma_mch2,ten_mch2', 'ma_nhom'),
    ]).then(([inventory, catalog]) => {
      if (!active) return;
      setSnapshot({ inventory, catalog: new Map(catalog.map(row => [row.ma_nhom, row])) });
    }).catch(error => {
      if (active) setError(error.message);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [refresh]);

  const overview = useMemo(() => snapshot && summarizeInventory(snapshot.inventory, snapshot.catalog), [snapshot]);
  const summary = useMemo(() => {
    if (!snapshot || !industry) return overview;
    return summarizeInventory(snapshot.inventory.filter(row => String(row.nhom_vat_tu ?? '').trim() === industry), snapshot.catalog);
  }, [snapshot, overview, industry]);

  function downloadReport() {
    if (!snapshot || !summary || busy || error) return;
    setExportError('');
    try { exportDashboard({ ...snapshot, summary, overview, industry, period, totals, periodCategories: result?.categories }); }
    catch (err) { setExportError(err.message || 'Không xuất được báo cáo.'); }
  }

  function saveVisual(print) {
    setExportError('');
    try { saveDashboardSnapshot(dashboardRef.current, industry, print); }
    catch (err) { setExportError(err.message); }
  }

  const groups = result?.categories?.categories ?? [];
  const primary = [
    { label: 'Tổng CLKK MCH3 (không Fresh)', value: totals?.total, Icon: TrendingDown },
    { label: 'Doanh thu không Fresh', value: totals?.revenue, Icon: Wallet },
    { label: 'Tỷ lệ CLKK / doanh thu', value: totals?.ratio, format: percent.format, Icon: Percent },
    { label: 'GT VĐM (định mức 0,30%)', value: totals?.excess, Icon: CircleAlert },
  ];


  return <div ref={dashboardRef} className="dashboard-view" aria-busy={busy}>
    <header className="dashboard-hero">
      <div className="dashboard-hero-header">
        <div><h2>Tổng quan kiểm kê</h2>
          {period && <p className="dashboard-period-context"><CalendarDays size={16} aria-hidden="true"/>{period.ma_ch} · Ngày kiểm kê {date(period.ngay_moi)}</p>}
        </div>
        <label className="dashboard-period-picker">Kỳ kiểm kê
          <select value={selectedPeriod} disabled={periodsBusy || !dates?.schedules.length} onChange={event => setSelectedPeriod(event.target.value)}>
            <option value="">{periodsBusy ? 'Đang tải lịch…' : dates?.schedules.length ? 'Chọn kỳ kiểm kê' : 'Chưa có lịch phù hợp'}</option>
            {dates?.schedules.map(row => <option key={periodKey(row)} value={periodKey(row)}>{row.ma_ch} · {date(row.ngay_moi)}</option>)}
          </select>
        </label>
      </div>
      <div className="dashboard-primary">
        {primary.map(({ label, value, format, Icon }) => <div key={label}>
          <Icon size={21} aria-hidden="true"/>
          <Readout label={label} value={value} format={format}/>
        </div>)}
      </div>
    </header>
    <div className="dashboard-toolbar">
      <div><p className="dashboard-caption">Nguồn ngày D: DSCL gốc · Đơn vị VND</p></div>
      <div className="dashboard-controls">
        <label>MCH3 của DSCL<select className="dashboard-industry-select" value={industry} onChange={event => setIndustry(event.target.value)}>
          <option value="">Tất cả MCH3</option>
          {overview?.industries.filter(row => row.code).map(row => <option key={row.code} value={row.code}>{row.name} · {row.code}</option>)}
        </select></label>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>
          <RefreshCw size={16} aria-hidden="true"/> Tải lại
        </Button>
        <Button type="button" disabled={busy || !!error || !summary} onClick={downloadReport}>
          <FileSpreadsheet size={16} aria-hidden="true"/> Xuất Excel
        </Button>
        <Button type="button" variant="outline" disabled={busy || !!error || !summary} onClick={() => saveVisual(false)}>Sao lưu Dashboard</Button>
        <Button type="button" variant="outline" disabled={busy || !!error || !summary} onClick={() => saveVisual(true)}>In / Lưu PDF</Button>
      </div>
    </div>
    {exportError && <p className="warning" role="alert">{exportError}</p>}
    {busy && <p role="status">Đang tải dữ liệu kiểm kê…</p>}
    {error && <p className="warning" role="alert">Không tải được dữ liệu mới. {error}</p>}
    <section className="panel dashboard-panel">
      <h2>Kết quả chênh lệch kiểm kê ngày D{period ? ` · ${date(period.ngay_moi)}` : ''}</h2>
      <p className="dashboard-caption">Giá trị từ DSCL gốc, trước điều chỉnh Final.{period && !dates?.codes.length ? ' DSCL chưa có mã SAP để đối chiếu với kỳ đang chọn.' : ''}</p>
      {summary && snapshot.inventory.length ? <DiscrepancyMetrics summary={summary}/> : !busy && !error && <p className="empty">Chưa có dữ liệu DSCL.</p>}
    </section>
    <section className="panel dashboard-panel dashboard-period-results">
      <h2>Kết quả chênh lệch kiểm kê cả kỳ{period ? ` · ${date(period.ngay_cu)} – ${date(period.ngay_moi)}` : ''}</h2>
      {isPeriodLoading && <p role="status">Đang tải số liệu cả kỳ…</p>}
      {(periodError || result?.error) && <p className="warning" role="alert">Không tải được số liệu cả kỳ. {periodError || result.error}</p>}
      {!period && !isPeriodLoading && !periodError && <p className="empty">{dates?.schedules.length ? 'Chọn kỳ kiểm kê để xem số liệu SAP.' : 'Nhập lịch kiểm kê ở tab Báo cáo CLKK và Biên bản.'}</p>}
      {sameMonth && <p className="warning">Kỳ cũ và kỳ mới cùng tháng. Cần xác nhận nghiệp vụ trước khi tính.</p>}
      {totals && <>
        <p className="dashboard-caption">Tạm tính với ngày D = 0. Cần xác nhận thời điểm cắt dữ liệu SAP tháng T.</p>
        {totals.missing.length > 0 && <p className="warning">Thiếu dữ liệu SAP tháng {totals.missing.join(', ')}.</p>}
        {totals.invalidCategory && <p className="warning">Có nhóm thiếu MCH2, chưa phân loại Fresh hoặc không Fresh.</p>}
        {totals.revenue === 0 && <p className="warning">Doanh thu không Fresh bằng 0. Chưa thể tính tỷ lệ CLKK.</p>}
        <div className="inv-kpis dashboard-kpis">
          <Readout label="CL không Fresh trước tháng T" value={totals.before}/>
          <Readout label="CL không Fresh tháng T + D" value={totals.during}/>
          <Readout label="CL Fresh cả kỳ" value={totals.fresh}/>
          <Readout label="Vượt định mức 0,30%" value={totals.excess}/>
        </div>
      </>}
    </section>
    <section className="panel dashboard-panel">
      <h2>Kết quả MCH2 (Cả kỳ)</h2>
      {result?.categories?.departments.length ? <div className="dashboard-mch2-list">
        {result.categories.departments.map(row => <section key={row.name} className="dashboard-mch2-group">
          <h3>{row.name || 'Chưa xác định MCH2'}</h3>
          <dl>
            <div><dt>Netoff</dt><dd className={tone(row.net)}>{money(row.net)}</dd></div>
            <div><dt>GT MCH3</dt><dd className={tone(row.value)}>{row.value == null ? 'N/A' : money(row.value)}</dd></div>
            <div><dt>Doanh thu</dt><dd>{row.revenue == null ? 'N/A' : money(row.revenue)}</dd></div>
            <div><dt>Tỉ lệ MCH2</dt><dd className={tone(row.ratio)}>{row.ratio == null ? 'N/A' : percent.format(row.ratio)}</dd></div>
          </dl>
        </section>)}
      </div> : !isPeriodLoading && <p className="empty">Chưa có dữ liệu MCH2 cả kỳ.</p>}
    </section>
    <section className="panel dashboard-panel">
      <h2>Kết quả MCH3 (Cả kỳ)</h2>
      {groups.length ? <>
        <p className="dashboard-caption">Lệch âm và dương cộng từ Netoff MCH3 từng tháng. Tỉ lệ MCH3 = GT MCH3 / doanh thu của nhóm. GT VĐM dùng định mức {percent.format(lossRate)}.</p>
        <div className="tablewrap dashboard-scroll">
          <table className="dashboard-mch-table">
            <thead><tr>{['Ngành hàng', 'Lệch âm', 'Lệch dương', 'Netoff', 'GT MCH3', 'Tỉ lệ MCH3', 'GT VĐM MCH3'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{groups.map(row => <tr key={JSON.stringify([row.parent, row.name])}>
              <th scope="row">{row.name}<small>{row.parent}</small></th>
              <td className={tone(row.negative)}>{money(row.negative)}</td>
              <td className={tone(row.positive)}>{money(row.positive)}</td>
              <td className={tone(row.net)}>{money(row.net)}</td>
              <td className={tone(row.value)}>{row.value == null ? 'N/A' : money(row.value)}</td>
              <td className={tone(row.ratio)}>{row.ratio == null ? 'N/A' : percent.format(row.ratio)}</td>
              <td className={tone(row.excess)}>{row.excess == null ? 'N/A' : money(row.excess)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : !isPeriodLoading && <p className="empty">Chưa có dữ liệu MCH3 cả kỳ.</p>}
    </section>
    {summary && <>
      <section className="dashboard-product-section"><h2>TOP 10 Mã hàng âm dương</h2><div className="dashboard-split">
        <ProductRanking title="10 mã lệch âm lớn nhất" rows={summary.negativeTop} direction="negative"/>
        <ProductRanking title="10 mã lệch dương lớn nhất" rows={summary.positiveTop} direction="positive"/>
      </div></section>
    </>}
  </div>;
}

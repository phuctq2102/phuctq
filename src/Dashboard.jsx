import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ClipboardList, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from './supabase';
import { Button } from './components/ui/button';
import { summarizeInventory, summarizeZones } from './dashboardData';
import './dashboard.css';

const integer = new Intl.NumberFormat('vi-VN');
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const money = value => currency.format(Math.abs(value) < 0.5 ? 0 : value);

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

function ProductRanking({ title, rows, direction }) {
  const Icon = direction === 'negative' ? ArrowDownRight : ArrowUpRight;
  return <section className="panel dashboard-panel">
    <h2><Icon size={19} aria-hidden="true"/> {title}</h2>
    {rows.length ? <ol className="dashboard-ranking">
      {rows.map(row => <li key={row.code}>
        <div><strong>{row.name || row.code}</strong>{row.name && <small>{row.code}</small>}</div>
        <strong className={direction}>{money(row.value)}</strong>
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
  const [snapshot, setSnapshot] = useState(null);
  const [industry, setIndustry] = useState('');
  const [zone, setZone] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    Promise.all([
      readPages('dscl', 'ma_sp,ten_sp,nhom_vat_tu,gt_chenh_lech,sl_dem,sl_so'),
      readPages('v10_nganh_hang', 'ma_nhom,ten_nganh,ma_mch2,ten_mch2', 'ma_nhom'),
      readPages('ct_kv', 'ma_sp,khu_vuc'),
    ]).then(([inventory, catalog, details]) => {
      if (!active) return;
      setSnapshot({ inventory, catalog: new Map(catalog.map(row => [row.ma_nhom, row])), zones: summarizeZones(details) });
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

  const chartScale = Math.max(1, ...summary?.industries.flatMap(row => [row.positive, -row.negative]) ?? []);
  const metrics = summary && [
    ['Mã sản phẩm', integer.format(summary.productCount), ''],
    ['Tổng lệch âm', money(summary.negative), 'negative'],
    ['Tổng lệch dương', money(summary.positive), 'positive'],
    ['Chênh lệch ròng', money(summary.positive + summary.negative), summary.positive + summary.negative < 0 ? 'negative' : ''],
  ];

  return <div className="dashboard-view" aria-busy={busy}>
    <div className="dashboard-toolbar">
      <div><h2><ClipboardList size={20} aria-hidden="true"/> Chênh lệch theo DSCL</h2><p className="dashboard-caption">Giá trị gốc theo Danh sách mã hàng · Đơn vị VNĐ</p></div>
      <div className="dashboard-controls">
        <label>Ngành hàng<select value={industry} onChange={event => setIndustry(event.target.value)}>
          <option value="">Tất cả MCH3</option>
          {overview?.industries.filter(row => row.code).map(row => <option key={row.code} value={row.code}>{row.name} · {row.code}</option>)}
        </select></label>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>
          <RefreshCw size={16} aria-hidden="true"/> Tải lại
        </Button>
      </div>
    </div>
    {busy && <p role="status">Đang tải dữ liệu kiểm kê…</p>}
    {error && <p className="warning" role="alert">Không tải được dữ liệu mới. {error}</p>}
    {summary && <>
      <div className="inv-kpis dashboard-kpis">
        {metrics.map(([label, value, tone]) => <div key={label}><small>{label}</small><strong className={tone}>{value}</strong></div>)}
      </div>
      <section className="panel dashboard-panel">
        <h2>Chênh lệch ròng (netoff) theo MCH2</h2>
        <p className="dashboard-caption">Tổng lệch âm cộng tổng lệch dương của các mã thuộc từng ngành, trên toàn bộ DSCL.</p>
        <div className="tablewrap dashboard-scroll">
          <table>
            <thead><tr><th scope="col">Ngành hàng MCH2</th><th scope="col">Chênh lệch ròng</th></tr></thead>
            <tbody>{overview.parents.map(row => <tr key={row.code}>
              <th scope="row">{row.name}<small>{row.code}</small></th>
              <td className={row.net < 0 ? 'negative' : row.net > 0 ? 'positive' : ''}>{money(row.net)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!overview.parents.length && <p className="empty">Không có dữ liệu DSCL.</p>}
      </section>
      <section className="panel dashboard-panel">
        <h2>Top thất thoát theo MCH3</h2>
        <p className="dashboard-caption">Sắp theo chênh lệch ròng từ âm nhất đến dương nhất.</p>
        <div className="tablewrap dashboard-scroll">
          <table className="dashboard-mch-table">
            <thead><tr><th scope="col">Ngành hàng</th><th scope="col">Dòng DSCL</th><th scope="col">Lệch âm</th><th scope="col">Lệch dương</th><th scope="col">Ròng</th></tr></thead>
            <tbody>{summary.industries.map(row => <tr key={row.code}>
              <th scope="row">{row.name}<small>{row.code}</small></th>
              <td>{integer.format(row.count)}</td>
              <td className="negative">{money(row.negative)}<div className="dashboard-bar" aria-hidden="true"><span style={{ width: (-row.negative / chartScale) * 100 + '%' }}/></div></td>
              <td className="positive">{money(row.positive)}<div className="dashboard-bar" aria-hidden="true"><span style={{ width: (row.positive / chartScale) * 100 + '%' }}/></div></td>
              <td className={row.net < 0 ? 'negative' : row.net > 0 ? 'positive' : ''}>{money(row.net)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!summary.industries.length && <p className="empty">Không có dữ liệu DSCL.</p>}
      </section>
      <div className="dashboard-split">
        <ProductRanking title="10 mã lệch âm lớn nhất" rows={summary.negativeTop} direction="negative"/>
        <ProductRanking title="10 mã lệch dương lớn nhất" rows={summary.positiveTop} direction="positive"/>
      </div>
      <section className="panel dashboard-panel">
        <div className="dashboard-toolbar">
          <div><h2><MapPin size={20} aria-hidden="true"/> Kiểm đếm theo khu vực · CTKV</h2><p className="dashboard-caption">Thời lượng mỗi vòng = thời điểm bắn cuối − thời điểm bắn đầu trong cùng khu vực. CTKV chưa có các mốc này.</p></div>
          <label>Khu vực<select value={zone} onChange={event => setZone(event.target.value)}>
            <option value="">Tất cả khu vực</option>
            {snapshot.zones.filter(row => row.zone).map(row => <option key={row.zone}>{row.zone}</option>)}
          </select></label>
        </div>
        <div className="tablewrap dashboard-scroll">
          <table>
            <thead><tr><th scope="col">Khu vực</th><th scope="col">Mã sản phẩm</th><th scope="col">Dòng CTKV</th><th scope="col">Round 1</th><th scope="col">Round 2</th></tr></thead>
            <tbody>{snapshot.zones.filter(row => !zone || row.zone === zone).map(row => <tr key={row.zone}>
              <th scope="row">{row.zone || 'Chưa có khu vực'}</th><td>{integer.format(row.products.size)}</td><td>{integer.format(row.lines)}</td><td>Chưa có dữ liệu</td><td>Chưa có dữ liệu</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!snapshot.zones.length && <p className="empty">Không có dữ liệu CTKV.</p>}
      </section>
    </>}
  </div>;
}

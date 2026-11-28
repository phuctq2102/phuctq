import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { recapRowKey, sortRecapRows } from './recapData';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value.split('-').reverse().join('/');
const valueOf = (value, format = money) => value == null ? 'N/A' : format.format(value);

export default function RecapRankings({ rows, selected, revision, onOpenPeriod }) {
  const [order, setOrder] = useState('excess');
  const [itemsOpen, setItemsOpen] = useState(false);
  const [products, setProducts] = useState(null);
  const keys = useMemo(() => JSON.stringify(rows.map(({ ma_ch, ngay_moi }) => ({ ma_ch, ngay_moi }))), [rows]);

  useEffect(() => {
    if (!itemsOpen) return;
    let active = true;
    setProducts(null);
    supabase.rpc('v10_dashboard_top_dscl', { p_periods: JSON.parse(keys) }).then(({ data, error }) => {
      if (active) setProducts(error ? { error: error.message } : { data });
    }, error => {
      if (active) setProducts({ error: error.message });
    });
    return () => { active = false; };
  }, [itemsOpen, keys, revision]);

  const top = useMemo(() => sortRecapRows(rows.filter(row => {
    if (order === 'hcxl') return Number(row.hcxl) > 0;
    return row.complete && row[order] != null && Number(row[order]) < 0;
  }), order).slice(0, 10), [rows, order]);
  const compared = rows.filter(row => selected.includes(recapRowKey(row)));
  const compareMetrics = [
    ['Ngày kiểm kê','ngay_moi',date], ['GĐV','gdv',value=>value], ['QLKV','qlkv',value=>value],
    ['CLKK MCH3','clkk',value=>valueOf(value)], ['Doanh thu','doanh_thu',value=>valueOf(value)],
    ['Tỷ lệ CLKK','ratio',value=>valueOf(value,percent)], ['GT vượt định mức','excess',value=>valueOf(value)],
    ['HCXL','hcxl',value=>value==null?'Chưa có':valueOf(value)],
  ];

  return <section className="panel dashboard-panel">
    <div className="dashboard-section-heading">
      <h2>Top 10 cửa hàng theo kỳ</h2>
      <label>Xếp theo <select value={order} onChange={event => setOrder(event.target.value)}>
        <option value="excess">Giá trị vượt định mức</option><option value="clkk">CLKK âm</option>
        <option value="ratio">Tỷ lệ CLKK âm</option><option value="hcxl">HCXL</option>
      </select></label>
    </div>
    {top.length ? <ol className="recap-rank-list">
      {top.map(row => <li key={recapRowKey(row)}>
        <span><strong>{row.ma_ch}</strong> · {row.ten_ch}<small>{date(row.ngay_moi)} · {row.qlkv}</small></span>
        <strong className={order === 'hcxl' ? '' : 'negative'}>{valueOf(row[order], order === 'ratio' ? percent : money)}</strong>
        <button type="button" onClick={() => onOpenPeriod(row)}>Mở kỳ</button>
      </li>)}
    </ol> : <p>Không có cửa hàng phù hợp với chỉ tiêu xếp hạng.</p>}
    <details onToggle={event => setItemsOpen(event.currentTarget.open)}>
      <summary>Top 10 mã hàng âm và dương từ DSCL</summary>
      <p className="dashboard-caption">Gộp chênh lệch theo mã hàng từ các kỳ có DSCL trong phạm vi đang lọc. Một kỳ chưa có DSCL không đóng góp vào xếp hạng.</p>
      {itemsOpen && !products && <p role="status">Đang tải xếp hạng mã hàng…</p>}
      {products?.error && <p role="alert">{products.error}</p>}
      {products?.data && <><p>{products.data.matched}/{rows.length} kỳ có DSCL.</p>
        <div className="dashboard-split">
          {[[products.data.negative, 'Mã âm', 'negative'], [products.data.positive, 'Mã dương', 'positive']].map(([items,label,tone]) => <div key={label}>
            <h3>{label}</h3>
            {items.length ? <ol className="recap-rank-list">{items.map(row => <li key={row.ma_sp}>
              <span><strong>{row.ma_sp}</strong><small>{row.ten_sp}</small></span><strong className={tone}>{valueOf(row.net)}</strong>
            </li>)}</ol> : <p>Chưa có mã phù hợp.</p>}
          </div>)}
        </div>
      </>}
    </details>
    {compared.length >= 2 && <section className="dashboard-panel" id="recap-compare">
      <h3>So sánh các kỳ đã chọn</h3>
      <div className="tablewrap"><table>
        <thead><tr><th scope="col">Chỉ tiêu</th>{compared.map(row => <th scope="col" key={recapRowKey(row)}>{row.ma_ch} · {date(row.ngay_moi)}</th>)}</tr></thead>
        <tbody>{compareMetrics.map(([label,key,format]) => <tr key={key}><th scope="row">{label}</th>{compared.map(row => <td key={recapRowKey(row)}>{format(row[key])}</td>)}</tr>)}</tbody>
      </table></div>
    </section>}
  </section>;
}

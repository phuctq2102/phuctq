import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { parseHcxl, parseSap, parseSchedule, parseStaff, readClkkFile, summarizeClkk, summarizeHcxl } from './clkkData';
import './clkkReport.css';

const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = value => value == null ? 'N/A' : vnd.format(value);
const imports = {
  schedule: { label: 'Lịch kiểm kê toàn hệ thống', table: 'v10_clkk_lich', key: 'ma_ch,ngay_moi', parse: parseSchedule, unit: 'lịch cửa hàng' },
  sap: { label: 'Doanh thu và CLKK SAP', table: 'v10_clkk_sap', key: 'ma_ch,thang', parse: parseSap, unit: 'nhóm cửa hàng/tháng' },
  hcxl: { label: 'Hàng chờ xử lý (HCXL)', table: 'v10_clkk_hcxl', key: 'ma_ch,ngay_moi', parse: parseHcxl, unit: 'cửa hàng' },
  staff: { label: 'Danh mục nhân sự', table: 'v10_clkk_nhan_su', key: 'ma_ch,mnv', parse: parseStaff, unit: 'nhân viên' },
};
const blankFilters = { thang: '', mch2: '', mch3: '' };

export default function ClkkReport() {
  const [stores, setStores] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [hcxlDates, setHcxlDates] = useState({});
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(null);
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState(blankFilters);
  const [rate, setRate] = useState('0.3');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  async function loadPeriods() {
    const { data: codes, error } = await supabase.rpc('v10_clkk_cua_hang');
    if (error) throw error;
    setStores(codes);
    const schedules = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from('v10_clkk_lich').select('*').order('ngay_moi', { ascending: false }).order('ma_ch');
      if (codes.length) query = query.in('ma_ch', codes);
      const { data, error: scheduleError } = await query.range(offset, offset + 499);
      if (scheduleError) throw scheduleError;
      schedules.push(...data);
      if (data.length < 500) break;
    }
    setPeriods(schedules);
    setSelected(codes.length === 1 && schedules.length === 1 ? periodKey(schedules[0]) : '');
  }

  useEffect(() => {
    loadPeriods().catch(error => setMessage(error.message)).finally(() => setBusy(false));
  }, []);

  const periodKey = row => `${row.ma_ch}|${row.ngay_moi}`;
  const period = periods.find(row => periodKey(row) === selected);
  const sameMonth = period && period.ngay_cu.slice(0, 7) === period.ngay_moi.slice(0, 7);

  function clearReport() {
    setReport(null);
    setEmail('');
    setFilters(blankFilters);
  }

  async function preview(file, kind) {
    if (!file) return;
    setDraft(null);
    setMessage('');
    setBusy(true);
    try {
      const data = await readClkkFile(file, imports[kind].parse);
      setHcxlDates({});
      setDraft({ data, kind, name: file.name });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveUpload() {
    setBusy(true);
    setMessage('');
    const { table, key } = imports[draft.kind];
    const payload = draft.kind === 'hcxl' ? draft.data.map(row => ({ ...row, ngay_moi: hcxlDates[row.ma_ch] })) : draft.data;
    try {
      const { error } = await supabase.from(table).upsert(payload, { onConflict: key });
      if (error) throw error;
      clearReport();
      setDraft(null);
      setConfirmed(false);
      if (draft.kind === 'schedule') await loadPeriods();
      setMessage('Đã lưu dữ liệu.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function calculate() {
    clearReport();
    setBusy(true);
    setMessage('');
    try {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.rpc('v10_clkk_mch3', { p_ma_ch: period.ma_ch, p_ngay_moi: period.ngay_moi })
          .order('thang').order('mch2').order('mch3').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      const [hcxl, staff] = await Promise.all([
        supabase.from('v10_clkk_hcxl').select('dong').eq('ma_ch', period.ma_ch).eq('ngay_moi', period.ngay_moi).maybeSingle(),
        supabase.from('v10_clkk_nhan_su').select('mnv', { count: 'exact', head: true }).eq('ma_ch', period.ma_ch),
      ]);
      if (hcxl.error) throw hcxl.error;
      if (staff.error) throw staff.error;
      setReport({ rows, hcxl: summarizeHcxl(hcxl.data?.dong), staffCount: staff.count, calculatedAt: new Date() });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const summary = report && summarizeClkk(report.rows, period, rate.trim() !== '' && Number(rate) >= 0 && Number(rate) <= 100 ? Number(rate) / 100 : null);
  const metrics = summary ? [
    ['CL không Fresh trước tháng T', summary.before],
    ['CL không Fresh tháng T + D (D = 0)', summary.during],
    ['Tổng CL không Fresh', summary.total],
    ['Tổng CL Fresh (D = 0)', summary.fresh],
    ['Doanh thu không Fresh', summary.revenue],
    ['Tỷ lệ CLKK/DT', summary.ratio, percent],
    ['Giá trị định mức', summary.quota],
    ['Giá trị vượt định mức', summary.excess],
    ['Tổng giá trị HCXL', report.hcxl?.total],
    ['HCXL đổi được', report.hcxl?.eligible],
    ['HCXL không đổi được', report.hcxl?.ineligible],
  ] : [];
  const visibleRows = report?.rows.filter(row => Object.entries(filters).every(([key, value]) => !value || row[key] === value)) ?? [];
  const metadata = Object.entries(period?.thong_tin ?? {});
  const storeName = metadata.find(([label]) => /tên (ch|cửa hàng)/i.test(label))?.[1];

  async function exportReport() {
    setBusy(true);
    setMessage('');
    try {
      const wb = XLSX.utils.book_new();
      const append = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
      const [year, month] = period.ngay_cu.split('-').map(Number);
      const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('v10_clkk_sap').select('dong')
        .eq('ma_ch', period.ma_ch).gte('thang', start).lte('thang', period.ngay_moi).order('thang');
      if (error) throw error;
      append('Bao cao', [['Mã SAP', period.ma_ch], ['Ngày kiểm kê', period.ngay_moi], ['Ngày D', 'Tạm tính 0'], ['Thời điểm cắt dữ liệu tháng T', 'Chưa xác nhận'], ...metrics.map(([label, value, format]) => [label, value == null ? 'N/A' : format ? format.format(value) : value])]);
      append('MCH3', [['Tháng', 'MCH2', 'MCH3', 'CL gốc', 'CL MCH3', 'Doanh thu'], ...report.rows.map(row => [row.thang, row.mch2, row.mch3, row.cl_goc, row.cl_mch3, row.doanh_thu])]);
      append('SAP goc', [['Store', 'Tên cửa hàng', 'MCH2', 'MCH3', 'Calendar Year/Month', 'Physical Inventory Var. Value VND', 'Revenue'], ...data.flatMap(batch => batch.dong.map(row => row.goc))]);
      XLSX.writeFile(wb, `Bao_cao_CLKK_${period.ma_ch}_${period.ngay_moi}.xlsx`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function createEmail() {
    setEmail([
      'Kính gửi các Anh/Chị,', '', 'Báo cáo kết quả kiểm kê cửa hàng',
      [period.ma_ch, storeName].filter(Boolean).join(' – '), `Ngày kiểm kê ${period.ngay_moi}`,
      'Số liệu tạm tính với ngày D = 0. Chưa xác nhận thời điểm cắt dữ liệu SAP tháng T.', '',
      ...metrics.map(([label, value, format]) => `${label}: ${value == null ? 'N/A' : format ? format.format(value) : fmt(value)}`),
    ].join('\n'));
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setMessage('Đã sao chép nội dung email.');
    } catch {
      setMessage('Không thể sao chép tự động. Bạn có thể chọn nội dung trong ô email để sao chép.');
    }
  }

  return <section className="panel clkk">
    <h2>Báo cáo CLKK và Biên bản</h2>
    {message && <p role="status">{message}</p>}
    <div className="clkk-grid">
      {Object.entries(imports).map(([kind, config]) => <label key={kind}>{config.label}
        <input type="file" accept=".xlsx,.xls" disabled={busy}
          onChange={event => { preview(event.target.files[0], kind); event.target.value = ''; }}/>
      </label>)}
    </div>
    {draft && <div>
      <p>{draft.name} · {draft.data.length} {imports[draft.kind].unit}. Các khóa trùng sẽ được cập nhật.</p>
      {draft.kind === 'hcxl' && <div className="clkk-grid">{draft.data.map(({ ma_ch, dong }) => <label key={ma_ch}>Ngày kiểm kê của {ma_ch} ({dong.length} dòng)
        <input type="date" required value={hcxlDates[ma_ch] ?? ''}
          onChange={event => setHcxlDates({ ...hcxlDates, [ma_ch]: event.target.value })}/>
      </label>)}</div>}
      <button type="button" disabled={busy || (draft.kind === 'hcxl' && draft.data.some(row => !hcxlDates[row.ma_ch]))} onClick={saveUpload}>Xác nhận nhập</button>{' '}
      <button type="button" disabled={busy} onClick={() => setDraft(null)}>Hủy</button>
    </div>}
    <p>{stores.length ? `Mã SAP từ DSCL: ${stores.join(', ')}` : 'DSCL chưa có mã SAP. Chọn kỳ trong lịch để xem báo cáo SAP độc lập.'}</p>
    <div className="clkk-grid">
      <label>Kỳ kiểm kê<select value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setConfirmed(false); clearReport(); }}>
        <option value="">{periods.length ? 'Chọn kỳ kiểm kê' : stores.length ? 'Chưa có lịch khớp mã SAP' : 'Chưa có lịch kiểm kê'}</option>
        {periods.map(row => <option key={periodKey(row)} value={periodKey(row)}>{row.ma_ch} · {row.ngay_cu} → {row.ngay_moi}</option>)}
      </select></label>
      <label>Định mức tạm tính (%)<input type="number" min="0" max="100" step="any" value={rate} onChange={event => { setRate(event.target.value); setEmail(''); }}/></label>
    </div>
    {period && <details><summary>Thông tin lịch cửa hàng</summary><dl>{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
    {sameMonth && <label className="clkk-warning"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); clearReport(); }}/> Kỳ cũ và kỳ mới cùng tháng. Xác nhận kỳ để xem trạng thái dữ liệu.</label>}
    <button type="button" disabled={busy || !period || (sameMonth && !confirmed)} onClick={calculate}>Tính CLKK</button>
    {busy && <p role="status">Đang xử lý…</p>}
    {summary && <>
      <p className="clkk-warning">Bản tính thử với ngày D = 0. Chưa xác nhận dữ liệu SAP tháng T đã cắt đến ngày {period.ngay_moi}.</p>
      {sameMonth && <p className="clkk-warning">Khoảng tháng theo quy tắc hiện hành rỗng. Cần chốt nghiệp vụ cho kỳ cùng tháng.</p>}
      {summary.missing.length > 0 && <p className="clkk-warning">Thiếu dữ liệu SAP tháng {summary.missing.join(', ')}.</p>}
      {summary.invalidCategory && <p className="clkk-warning">Có nhóm thiếu MCH2 nên chưa xác định Fresh hoặc không Fresh.</p>}
      {!summary.revenue && <p className="clkk-warning">Doanh thu không Fresh bằng 0 hoặc chưa đủ dữ liệu.</p>}
      {!report.hcxl && <p>Chưa có HCXL cho cửa hàng và ngày kiểm kê này.</p>}
      {report.hcxl?.incomplete > 0 && <p className="clkk-warning">HCXL có {report.hcxl.incomplete} dòng thiếu thành tiền hoặc điều kiện đổi trả.</p>}
      <p>Danh mục nhân sự cửa hàng: {report.staffCount} nhân viên.</p>
      <p>Tính lúc {report.calculatedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })}</p>
      <div className="clkk-grid">{metrics.map(([label, value, format]) => <div className="clkk-metric" key={label}>
        <span>{label}</span><strong className={value < 0 ? 'clkk-negative' : value > 0 ? 'clkk-positive' : ''}>{value == null ? 'N/A' : format ? format.format(value) : fmt(value)}</strong>
      </div>)}</div>
      <details><summary>Chi tiết đối chiếu MCH3</summary>
        <div className="clkk-grid">{Object.entries({ thang: 'Tháng', mch2: 'MCH2', mch3: 'MCH3' }).map(([key, label]) => <label key={key}>{label}
          <select value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })}>
            <option value="">Tất cả</option>
            {[...new Set(report.rows.map(row => row[key]).filter(Boolean))].map(value => <option key={value}>{value}</option>)}
          </select></label>)}</div>
        <div className="tablewrap"><table><thead><tr>{['Tháng', 'MCH2', 'MCH3', 'CL gốc', 'CL MCH3', 'Doanh thu'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{visibleRows.map(row => <tr key={JSON.stringify([row.thang, row.mch2, row.mch3])}>
            <td>{row.thang.slice(0, 7)}</td><td>{row.mch2 || 'Chưa có'}</td><td>{row.mch3}</td><td>{fmt(row.cl_goc)}</td><td>{fmt(row.cl_mch3)}</td><td>{fmt(row.doanh_thu)}</td>
          </tr>)}</tbody></table></div>
      </details>
      <button type="button" disabled={busy} onClick={exportReport}>Xuất Excel CLKK</button>{' '}
      <button type="button" disabled={busy} onClick={createEmail}>Tạo nội dung email tạm tính</button>
      {email && <label>Nội dung email<textarea rows={12} value={email} onChange={event => setEmail(event.target.value)}/><button type="button" onClick={copyEmail}>Sao chép email</button></label>}
    </>}
  </section>;
}

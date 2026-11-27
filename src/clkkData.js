import * as XLSX from 'xlsx';

const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const clean = value => String(value ?? '').normalize('NFC').trim();
const textKey = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
const store = value => clean(value).toUpperCase();
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;

function dateKey(value) {
  if (!clean(value)) return null;
  const serial = typeof value === 'number' ? XLSX.SSF.parse_date_code(value) : null;
  const raw = clean(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const local = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(raw);
  const parts = serial ? [serial.y, serial.m, serial.d] : iso ? iso.slice(1) : local ? [local[3], local[2], local[1]] : [];
  const [year, month, day] = parts.map(Number);
  if (!(year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const date = `${monthKey(year, month).slice(0, 8)}${String(day).padStart(2, '0')}`;
  return new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

function numeric(value, line) {
  if (!clean(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Dòng ${line} có giá trị tiền không phải số Excel.`);
}

export function parseSap(rows) {
  const header = rows.findIndex(row => textKey(row[0]) === 'store' && /calendar year\/month/.test(textKey(row[4])));
  if (header < 0 || !/physical inventory var/.test(textKey(rows[header - 1]?.[5])) || textKey(rows[header - 1]?.[6]) !== 'revenue') {
    throw new Error('Cần file SAP gốc với tiêu đề Store, Calendar Year/Month, Physical Inventory Var. và Revenue.');
  }
  const batches = new Map();
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(value => clean(value))) return;
    const [code, name, mch2, mch3, period, cl, dt] = row;
    const match = /^([A-Z]{3})\s+(\d{4})$/.exec(store(period));
    const month = match && months.indexOf(match[1]) + 1;
    if (!clean(code) || !month || !clean(mch3)) throw new Error(`Dòng ${header + index + 2} thiếu cửa hàng, tháng hợp lệ hoặc MCH3.`);
    const ma_ch = store(code);
    const thang = monthKey(match[2], month);
    const key = `${ma_ch}|${thang}`;
    if (!batches.has(key)) batches.set(key, { ma_ch, thang, dong: [] });
    const line = header + index + 2;
    batches.get(key).dong.push({ ten_ch: clean(name), mch2: clean(mch2), mch3: clean(mch3), cl: numeric(cl, line), dt: numeric(dt, line), goc: row });
  });
  return [...batches.values()];
}

export function parseSchedule(rows) {
  const aliases = [
    ['mã sap', 'mã sap cửa hàng', 'mã ch', 'ma_ch', 'store'],
    ['ngày kiểm kê cũ', 'ngày kiểm kê trước', 'ngay_kk_cu'],
    ['ngày kiểm kê mới', 'ngay_kk_moi'],
  ];
  const header = rows.findIndex(row => aliases.every(names => row.some(value => names.includes(textKey(value)))));
  if (header < 0) throw new Error('Cần các cột Mã SAP, Ngày kiểm kê cũ và Ngày kiểm kê mới.');
  const indexes = aliases.map(names => rows[header].findIndex(value => names.includes(textKey(value))));
  const periods = new Map();
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(value => clean(value))) return;
    const [code, oldDate, newDate] = indexes.map(i => row[i]);
    const ma_ch = store(code);
    const ngay_cu = dateKey(oldDate);
    const ngay_moi = dateKey(newDate);
    if (!ma_ch || !ngay_cu || !ngay_moi || ngay_cu >= ngay_moi) throw new Error(`Lịch không hợp lệ tại dòng ${header + index + 2}.`);
    const key = `${ma_ch}|${ngay_moi}`;
    if (periods.has(key)) throw new Error(`Lịch trùng trong file tại dòng ${header + index + 2}.`);
    const thong_tin = Object.fromEntries(rows[header].flatMap((label, i) => clean(label) && clean(row[i]) ? [[clean(label), clean(row[i])]] : []));
    periods.set(key, { ma_ch, ngay_cu, ngay_moi, thong_tin });
  });
  return [...periods.values()];
}

export async function readClkkFile(file, parse) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null, blankrows: false });
  const data = parse(rows);
  if (!data.length) throw new Error('File không có dữ liệu để nhập.');
  return data;
}

export function summarizeClkk(rows, period, rate) {
  const currentMonth = period.ngay_moi.slice(0, 7);
  const [year, month] = period.ngay_cu.slice(0, 7).split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month, 1));
  const available = new Set(rows.map(row => row.thang.slice(0, 7)));
  const missing = [];
  while (cursor.toISOString().slice(0, 7) <= currentMonth) {
    const key = cursor.toISOString().slice(0, 7);
    if (!available.has(key)) missing.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const nonFresh = rows.filter(row => row.fresh === false);
  const current = row => row.thang.slice(0, 7) === currentMonth;
  const sum = (group, field) => group.reduce((total, row) => total + Number(row[field] ?? 0), 0);
  const before = missing.some(key => key < currentMonth) ? null : sum(nonFresh.filter(row => !current(row)), 'cl_mch3');
  const during = available.has(currentMonth) ? sum(nonFresh.filter(current), 'cl_mch3') : null;
  const total = before == null || during == null ? null : before + during;
  const revenue = !missing.length && nonFresh.some(row => row.doanh_thu != null) ? sum(nonFresh, 'doanh_thu') : null;
  const quota = revenue == null || rate == null ? null : revenue * rate;
  return {
    before, during, total, revenue, quota, missing,
    invalidCategory: rows.some(row => row.fresh == null),
    fresh: available.has(currentMonth) ? sum(rows.filter(row => row.fresh === true && current(row)), 'cl_mch3') : null,
    ratio: total != null && revenue ? total / revenue : null,
    excess: total == null || quota == null ? null : Math.min(total + quota, 0),
  };
}

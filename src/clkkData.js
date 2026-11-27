import * as XLSX from 'xlsx/xlsx.mjs';

const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const clean = value => String(value ?? '').normalize('NFC').trim();
const textKey = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
const store = value => clean(value).toUpperCase();
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;

function dateKey(value, date1904 = false) {
  if (!clean(value)) return null;
  const serial = typeof value === 'number' ? XLSX.SSF.parse_date_code(value, { date1904 }) : null;
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

export function parseSchedule(rows, date1904) {
  const aliases = [
    ['mã sap', 'mã sap cửa hàng', 'mã ch', 'ma_ch', 'store'],
    ['ngày kiểm kê cũ', 'ngày kiểm kê trước', 'ngay_kk_cu'],
    ['ngày kiểm kê mới', 'ngay_kk_moi', /^lịch kiểm kê(?: \d{4})?$/],
  ];
  const header = rows.findIndex(row => aliases.every(names => row.some(value => names.some(name => name instanceof RegExp ? name.test(textKey(value)) : name === textKey(value)))));
  if (header < 0) throw new Error('Cần các cột Mã SAP, Ngày kiểm kê cũ và Ngày kiểm kê mới.');
  const indexes = aliases.map(names => rows[header].findIndex(value => names.some(name => name instanceof RegExp ? name.test(textKey(value)) : name === textKey(value))));
  const periods = new Map();
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(value => clean(value))) return;
    const [code, oldDate, newDate] = indexes.map(i => row[i]);
    const ma_ch = store(code);
    const ngay_cu = dateKey(oldDate, date1904);
    const ngay_moi = dateKey(newDate, date1904);
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
  const data = parse(rows, Boolean(workbook.Workbook?.WBProps?.date1904));
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

export function parseHcxl(rows, date1904) {
  const headers = ['mã ch', 'mã sản phẩm', 'tên sản phẩm', 'hsd (tháng/ngày/năm)', 'thành tiền', 'điều kiện đổi trả (có/không)'];
  const header = rows.findIndex(row => headers.every(label => row.some(value => textKey(value) === label)));
  if (header < 0) throw new Error('Không tìm thấy tiêu đề GT_HCXL từ mẫu Excel.');
  const positions = headers.map(label => rows[header].findIndex(value => textKey(value) === label));
  const groups = new Map();
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(value => clean(value))) return;
    const [code, product, name, expiry, amount, eligibility] = positions.map(i => row[i]);
    const ma_ch = store(code);
    const line = header + index + 2;
    if (!ma_ch || !clean(product)) throw new Error(`Dòng ${line} thiếu mã CH hoặc mã sản phẩm.`);
    const hsd = dateKey(expiry, date1904);
    if (!hsd) throw new Error(`Dòng ${line} thiếu HSD hợp lệ.`);
    const dieu_kien = textKey(eligibility);
    const dong = { ma_sp: clean(product), ten_sp: clean(name), hsd, thanh_tien: numeric(amount, line),
      doi_tra: dieu_kien === 'có' ? true : dieu_kien === 'không' ? false : null, goc: row };
    if (!groups.has(ma_ch)) groups.set(ma_ch, []);
    groups.get(ma_ch).push(dong);
  });
  return Array.from(groups, ([ma_ch, dong]) => ({ ma_ch, dong }));
}

export function parseStaff(rows) {
  const headers = ['mnv', 'tên nv', 'ch'];
  const header = rows.findIndex(row => headers.every(label => row.some(value => textKey(value) === label)));
  if (header < 0) throw new Error('Cần các cột MNV, Tên NV và CH.');
  const positions = headers.map(label => rows[header].findIndex(value => textKey(value) === label));
  const people = new Map();
  rows.slice(header + 1).forEach((row, index) => {
    if (!row.some(value => clean(value))) return;
    const [code, name, location] = positions.map(i => row[i]);
    const mnv = clean(code);
    const ten_nv = clean(name);
    const ma_ch = store(location);
    const key = JSON.stringify([ma_ch, mnv]);
    const line = header + index + 2;
    if (!mnv || !ten_nv || !ma_ch) throw new Error(`Dòng ${line} thiếu MNV, tên hoặc CH.`);
    if (people.has(key)) throw new Error(`Dòng ${line} trùng mã nhân viên tại cửa hàng.`);
    people.set(key, { ma_ch, mnv, ten_nv });
  });
  return [...people.values()];
}

export function summarizeHcxl(rows) {
  if (!rows?.length) return null;
  const sum = group => group.reduce((total, row) => total + row.thanh_tien, 0);
  const known = rows.filter(row => row.thanh_tien != null);
  return {
    total: known.length === rows.length ? sum(known) : null,
    eligible: rows.some(row => row.doi_tra == null || (row.doi_tra && row.thanh_tien == null))
      ? null : sum(known.filter(row => row.doi_tra === true)),
    ineligible: rows.some(row => row.doi_tra == null || (row.doi_tra === false && row.thanh_tien == null))
      ? null : sum(known.filter(row => row.doi_tra === false)),
    incomplete: rows.filter(row => row.thanh_tien == null || row.doi_tra == null).length,
  };
}

export function summarizePeriodCategories(rows, period) {
  const monthT = period.ngay_moi.slice(0, 7);
  const departments = new Map();
  const categories = new Map();

  function accumulate(groups, key, fields, row) {
    const group = groups.get(key) ?? { ...fields, net: 0, negative: 0, positive: 0, value: null, revenue: null };
    const net = Number(row.cl_goc ?? 0);
    group.net += net;
    group.negative += Math.min(net, 0);
    group.positive += Math.max(net, 0);
    if (row.doanh_thu != null) group.revenue = (group.revenue ?? 0) + Number(row.doanh_thu);
    if (row.fresh != null) {
      const included = !row.fresh || row.thang.slice(0, 7) === monthT;
      group.value = (group.value ?? 0) + (included ? Number(row.cl_mch3 ?? 0) : 0);
    }
    groups.set(key, group);
  }

  for (const row of rows) {
    const parent = row.mch2 ?? '';
    accumulate(departments, parent, { name: parent }, row);
    accumulate(categories, JSON.stringify([parent, row.mch3]), { name: row.mch3, parent }, row);
  }

  const sorted = groups => [...groups.values()].sort((a, b) => a.net - b.net || (a.name ?? '').localeCompare(b.name ?? '', 'vi'));
  return {
    departments: sorted(departments),
    categories: sorted(categories).map(row => ({
      ...row, ratio: row.value != null && row.revenue ? row.value / row.revenue : null,
    })),
  };
}

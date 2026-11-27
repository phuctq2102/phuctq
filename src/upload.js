import * as XLSX from 'xlsx';
import { parseCountTimestamp } from './countRoundTime';

const fields = {
  dscl: ['ma_sp', 'ten_sp', 'nganh_hang', 'nhom_vat_tu', 'dvt_co_ban', 'sl_so', 'sl_dem', 'gt_chenh_lech'],
  ct_kv: ['ma_sp', 'barcode', 'ten_sp', 'khu_vuc', 'dvt_nhap', 'sl_nhap', 'sl_dem', 'sl_so', 'round1_at', 'round2_at', 'nguoi_cap_nhat', 'nguoi_cap_nhat_round2'],
  bc: ['ma_sp', 'barcode', 'ten_sp', 'khu_vuc', 'dvt_co_ban', 'sl_dem'],
};

const aliases = {
  ma_sp: ['ma_sp', 'ma san pham', 'ma sp', 'material', 'vat tu'],
  ten_sp: ['ten_sp', 'ten san pham', 'ten sp', 'mo ta vat tu'],
  nganh_hang: ['nganh_hang', 'nganh hang'],
  nhom_vat_tu: ['nhom_vat_tu', 'nhom vat tu'],
  dvt_co_ban: ['dvt_co_ban', 'dvt co ban', 'don vi do luong co ban', 'don vi do luong cb'],
  sl_so: ['sl_so', 'sl so', 'so luong tren so', 'so luong so', 'sl tren so', 'ton so', 'so luong ton so', 'sl ton', 'so luong ton', 'so luong ton kho'],
  gt_chenh_lech: ['gt_chenh_lech', 'gt chenh lech', 'gia tri chenh lech', 'so tien chenh lech'],
  round1_at: ['round1_at', 'ngay cap nhat', 'round 1 ngay cap nhat', 'roud 1 ngay cap nhat', 'ngay cap nhat round 1', 'ngay cap nhat roud 1'],
  round2_at: ['round2_at', 'round 2 ngay cap nhat', 'roud 2 ngay cap nhat', 'ngay cap nhat round 2', 'ngay cap nhat roud 2', 'round 2 ngay cap nhat round 2', 'roud 2 ngay cap nhat round 2'],
  nguoi_cap_nhat: ['nguoi_cap_nhat', 'nguoi cap nhat'],
  nguoi_cap_nhat_round2: ['nguoi_cap_nhat_round2', 'nguoi cap nhat round 2', 'nguoi cap nhat roud 2'],
  barcode: ['barcode', 'bar code', 'ma vach', 'ean', 'ean upc', 'ma ean', 'ma barcode', 'ma vach san pham'],
  khu_vuc: ['khu_vuc', 'khu vuc', 'vi tri', 'khu vuc kiem dem', 'khu vuc dem'],
  dvt_nhap: ['dvt_nhap', 'don vi nhap', 'dvt nhap', 'don vi tinh nhap', 'dvt quy doi', 'don vi tinh quy doi', 'dvt nhap quy doi'],
  sl_nhap: ['sl_nhap', 'sl nhap', 'so luong nhap', 'so luong nhap goc'],
  sl_dem: ['sl_dem', 'sl dem', 'so luong duoc dem', 'so luong dem', 'sl kiem dem', 'so luong kiem dem', 'so luong thuc te', 'sl thuc te', 'so luong nhap quy doi', 'so luong nhap (quy doi)', 'sl quy doi', 'so luong quy doi'],
};

const numeric = new Set(['sl_so', 'gt_chenh_lech', 'sl_nhap', 'sl_dem']);

const norm = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const mapping = Object.fromEntries(
  Object.entries(aliases).flatMap(([key, names]) => names.map(name => [norm(name), key])),
);

function numberValue(value, cellLabel) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error(`${cellLabel}: số không hợp lệ`);
    return value;
  }

  let text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return null;

  // Giữ phần thập phân trong dữ liệu xuất từ SAP.
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  const number = Number(text);
  if (!Number.isFinite(number)) throw Error(`${cellLabel}: không phải số (${value})`);
  return number;
}

export async function parseExcel(file, table) {
  if (!fields[table]) throw Error('Bảng không hỗ trợ');
  if (file.size > 30 * 1024 * 1024) throw Error('File vượt quá 30 MB');

  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true });
  const sheet = workbook.SheetNames.find(name => norm(name) === norm(table)) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw Error('Không tìm thấy sheet Excel');

  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true, range: 0 });
  const headIndex = matrix.findIndex(row => row.some(value => mapping[norm(value)] === 'ma_sp'));
  if (headIndex < 0) throw Error('Không tìm thấy cột Mã SP / Mã sản phẩm / Vật tư');

  const header = matrix[headIndex];
  const colmap = header.map(value => mapping[norm(value).replace(/\b(roud|round)([12])\b/g, '$1 $2')] || null);

  if (table === 'ct_kv') {
    header.forEach((value, column) => {
      const name = norm(value);
      if (name === 'so luong nhap quy doi' || name === 'sl nhap quy doi') colmap[column] = 'sl_dem';
      if (name === 'so luong nhap') colmap[column] = 'sl_nhap';
      if (name === 'so luong ton kho') colmap[column] = null;
    });
  }

  const columns = [...new Set(colmap.filter(column => fields[table].includes(column)))];
  if (!columns.includes('ma_sp')) throw Error('Thiếu cột mã sản phẩm');
  if (columns.length < 2) throw Error('Không nhận diện đủ cột. Kiểm tra tiêu đề Excel');

  const required = table === 'ct_kv'
    ? ['ma_sp', 'ten_sp', 'sl_dem']
    : table === 'bc'
      ? ['ma_sp', 'barcode']
      : ['ma_sp', 'ten_sp', 'sl_dem', 'gt_chenh_lech'];
  const missing = required.filter(column => !columns.includes(column));
  if (missing.length) {
    throw Error(`File ${table.toUpperCase()} thiếu cột: ${missing.join(', ')}. Chưa thay đổi dữ liệu cũ.`);
  }

  // Dùng dấu của lượng chênh lệch để khôi phục dấu của giá trị chênh lệch SAP.
  const diffIndex = table === 'dscl'
    ? header.findIndex(value => norm(value) === 'luong chenh lech')
    : -1;

  const rows = [];
  for (let index = headIndex + 1; index < matrix.length; index++) {
    const row = matrix[index];
    if (!row.some(value => String(value ?? '').trim())) continue;

    const record = {};
    colmap.forEach((key, column) => {
      if (!key || !fields[table].includes(key) || Object.hasOwn(record, key)) return;

      const cell = XLSX.utils.encode_cell({ r: index, c: column });
      const value = key.startsWith('nguoi_cap_nhat') ? worksheet[cell]?.w ?? row[column] : row[column];
      if (value === null || value === undefined || String(value).trim() === '') return;

      if (key === 'round1_at' || key === 'round2_at') {
        const formatted = String(worksheet[cell]?.w ?? value).trim();
        if (value === 0 || /^0{1,2}[/.\-]0?1[/.\-]1900(?:\s+00:00(?::00)?)?$/.test(formatted)) return;
        const timestamp = parseCountTimestamp(value, workbook.Workbook?.WBProps?.date1904);
        if (!timestamp) throw Error(`Dòng Excel ${index + 1}: ${header[column]} không phải ngày giờ hợp lệ.`);
        record[key] = timestamp;
        return;
      }

      record[key] = numeric.has(key)
        ? numberValue(value, `Dòng Excel ${index + 1}, ${key}`)
        : String(value).trim();
    });

    if (!record.ma_sp) throw Error(`Dòng Excel ${index + 1} thiếu mã sản phẩm`);

    if (table === 'dscl' && diffIndex >= 0 && record.gt_chenh_lech !== undefined) {
      const delta = numberValue(row[diffIndex], `Dòng Excel ${index + 1}, lượng chênh lệch`);
      if (delta !== null) {
        record.gt_chenh_lech = Math.abs(record.gt_chenh_lech) * Math.sign(delta);
      }
    }

    if (table === 'dscl' && !Object.hasOwn(record, 'sl_dem')) {
      throw Error(`Dòng Excel ${index + 1}: thiếu giá trị Số lượng được đếm (cột I). Không thay thế dữ liệu.`);
    }

    rows.push(record);
  }

  if (!rows.length) throw Error('Không có dòng dữ liệu');

  if (table === 'dscl') {
    const sample = rows.slice(0, 5).map(row => `${row.ma_sp}: ${row.sl_dem}`).join('; ');
    console.info('[V10 DSCL] SL đếm Excel mẫu:', sample);
    if (rows.every(row => row.sl_dem === 0)) {
      throw Error('Toàn bộ SL đếm DSCL đều bằng 0. Hãy kiểm tra Excel trước khi thay thế dữ liệu.');
    }
  }

  return { table, sheet, columns, rows };
}

async function replaceBarcodeTable(supabase, rows, onProgress) {
  const total = rows.length;
  if (total > 100000) throw Error('File BC vượt quá 100.000 dòng.');

  const uploadId = crypto.randomUUID();
  const batchSize = 1000;
  onProgress(0, total);

  try {
    for (let offset = 0; offset < total; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const { data, error } = await supabase.rpc('v10_bc_stage_batch', {
        p_upload_id: uploadId,
        p_offset: offset,
        p_rows: batch,
      });

      if (error) throw error;
      if (data !== batch.length) {
        throw Error('Supabase trả về số dòng tạm không khớp.');
      }
      onProgress(offset + batch.length, total);
    }
  } catch (error) {
    await supabase.rpc('v10_bc_discard', { p_upload_id: uploadId });
    if (error.code === 'PGRST202') {
      throw Error('Supabase chưa có hàm tải BC theo lô. Hãy chạy SQL cài đặt BC.');
    }
    throw Error('Nạp BC vào bảng tạm thất bại: ' + error.message);
  }

  const { data, error } = await supabase.rpc('v10_bc_finalize', {
    p_upload_id: uploadId,
    p_expected: total,
  });

  if (error?.code === '57014') {
    throw Error('Supabase hủy bước thay thế BC vì quá thời gian. Giao dịch đã hoàn tác.');
  }
  if (error) {
    throw Error('Chưa xác nhận được kết quả thay thế BC: ' + error.message);
  }
  if (data !== total) throw Error('Supabase trả về số dòng BC không khớp.');
  return data;
}

export async function replaceTable(supabase, table, rows, onProgress = () => {}) {
  if (!fields[table] || !Array.isArray(rows) || !rows.length) {
    throw Error('Bảng hoặc dữ liệu không hợp lệ');
  }

  if (table === 'bc') {
    return replaceBarcodeTable(supabase, rows, onProgress);
  }

  onProgress(0, rows.length);
  const { data, error } = await supabase.rpc('v10_replace_direct', {
    p_table: table,
    p_rows: rows,
  });

  if (error) {
    if (/Could not find the function.*v10_replace_direct|schema cache/i.test(error.message)) {
      throw Error('Supabase chưa có hàm v10_replace_direct(p_table, p_rows). Vào SQL Editor chạy toàn bộ file SUPABASE_REPLACE_DIRECT.sql trong bộ ZIP, sau đó thử lại. Dữ liệu cũ không bị thay đổi bởi lỗi này.');
    }
    throw Error('Thay thế không thành công: ' + error.message + ' (giao dịch rollback nếu SQL phát sinh lỗi)');
  }

  if (table === 'dscl') {
    const sample = rows.find(row => row.sl_dem !== 0);
    const { data: check, error: checkError } = await supabase
      .from('dscl')
      .select('ma_sp,sl_dem')
      .eq('ma_sp', sample.ma_sp)
      .maybeSingle();

    if (checkError) {
      throw Error('Đã gửi DSCL nhưng chưa xác minh được dữ liệu lưu: ' + checkError.message);
    }
    if (!check || Number(check.sl_dem) !== Number(sample.sl_dem)) {
      throw Error(`DSCL đã upload nhưng Supabase lưu SL đếm không đúng cho mã ${sample.ma_sp}: Excel=${sample.sl_dem}, Supabase=${check?.sl_dem ?? 'không tìm thấy'}. Hãy chạy SUPABASE_REPLACE_DIRECT.sql trong ZIP để cập nhật RPC, rồi upload lại DSCL.`);
    }
  }

  onProgress(rows.length, rows.length);
  return data;
}

import * as XLSX from 'xlsx';

export function parseIndustryWorkbook(bytes) {
  const workbook = XLSX.read(bytes);
  for (const sheet of Object.values(workbook.Sheets)) {
    const [head = [], ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const headers = head.map(value => String(value).trim().toUpperCase());
    const codeIndex = headers.indexOf('MCH3_ID');
    const nameIndex = headers.indexOf('MCH3_DESC');
    if (codeIndex < 0 || nameIndex < 0) continue;

    const entries = new Map();
    for (const [index, row] of rows.entries()) {
      const code = String(row[codeIndex] ?? '').trim();
      const name = String(row[nameIndex] ?? '').trim().normalize('NFC');
      if (!code && !name) continue;
      if (!/^\d{5}$/.test(code) || !name || name.length > 200) {
        throw Error('Mã hoặc tên MCH3 không hợp lệ ở dòng ' + (index + 2) + '.');
      }
      if (entries.has(code) && entries.get(code) !== name) {
        throw Error('Mã ' + code + ' có nhiều tên ngành hàng trong cùng một file.');
      }
      entries.set(code, name);
    }
    if (!entries.size) throw Error('File không có danh mục MCH3.');
    return Array.from(entries, ([ma_nhom, ten_nganh]) => ({ ma_nhom, ten_nganh }));
  }
  throw Error('Cần file Excel có cột MCH3_ID và MCH3_Desc.');
}

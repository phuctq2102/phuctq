import * as XLSX from 'xlsx';

export function parseIndustryWorkbook(bytes) {
  const workbook = XLSX.read(bytes);
  for (const sheet of Object.values(workbook.Sheets)) {
    const [head = [], ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const headers = head.map(value => String(value).trim().toUpperCase());
    const codeIndex = headers.indexOf('MCH3_ID');
    const nameIndex = headers.indexOf('MCH3_DESC');
    if (codeIndex < 0 || nameIndex < 0) continue;

    const parentCodeIndex = headers.indexOf('MCH2_ID');
    const parentNameIndex = headers.indexOf('MCH2_DESC');
    const hasParents = parentCodeIndex >= 0 && parentNameIndex >= 0;
    if ((parentCodeIndex >= 0) !== (parentNameIndex >= 0)) {
      throw Error('Cần cả hai cột MCH2_ID và MCH2_Desc khi cập nhật MCH2.');
    }
    const entries = new Map();
    for (const [index, row] of rows.entries()) {
      const code = String(row[codeIndex] ?? '').trim();
      const name = String(row[nameIndex] ?? '').trim().normalize('NFC');
      if (!code && !name) continue;
      if (!/^\d{5}$/.test(code) || !name || name.length > 200) {
        throw Error('Mã hoặc tên MCH3 không hợp lệ ở dòng ' + (index + 2) + '.');
      }
      const entry = { ma_nhom: code, ten_nganh: name };
      if (hasParents) {
        entry.ma_mch2 = String(row[parentCodeIndex] ?? '').trim();
        entry.ten_mch2 = String(row[parentNameIndex] ?? '').trim().normalize('NFC');
        if (!/^\d{3}$/.test(entry.ma_mch2) || !entry.ten_mch2) {
          throw Error('Mã hoặc tên MCH2 không hợp lệ ở dòng ' + (index + 2) + '.');
        }
      }
      const existing = entries.get(code);
      if (existing && (existing.ten_nganh !== name || existing.ma_mch2 !== entry.ma_mch2 || existing.ten_mch2 !== entry.ten_mch2)) {
        throw Error('Mã ' + code + ' có nhiều tên hoặc nhóm cha trong cùng một file.');
      }
      entries.set(code, entry);
    }
    if (!entries.size) throw Error('File không có danh mục MCH3.');
    return [...entries.values()];
  }
  throw Error('Cần file Excel có cột MCH3_ID và MCH3_Desc.');
}

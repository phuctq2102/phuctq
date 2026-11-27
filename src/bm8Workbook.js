import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const bm8Fields = [
  { cell: 'A44', label: 'Những tồn đọng công tác chuẩn bị của CH', prefix: '1. Những tồn đọng công tác chuẩn bị của CH: ' },
  { cell: 'A45', label: 'Nhân sự tham gia hỗ trợ có đầy đủ và đúng giờ?', prefix: '2. Nhân sự tham gia hỗ trợ (có đi đầy đủ & đúng giờ ?): ' },
];

function readPart(parts, path) {
  if (!parts[path]) throw Error('File thiếu thành phần Excel cần thiết của mẫu BM8.');
  return strFromU8(parts[path]);
}

function parseXml(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw Error('Cấu trúc XML của mẫu Excel không hợp lệ.');
  return document;
}

function childrenByName(node, name) {
  return [...node.getElementsByTagNameNS('*', name)];
}

function readBm8Sheet(parts) {
  const workbook = parseXml(readPart(parts, 'xl/workbook.xml'));
  const relationships = parseXml(readPart(parts, 'xl/_rels/workbook.xml.rels'));
  const sheet = childrenByName(workbook, 'sheet').find(node => node.getAttribute('name') === 'BM8');
  if (!sheet) throw Error('Không tìm thấy sheet BM8 trong file mẫu.');
  const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const link = childrenByName(relationships, 'Relationship').find(node => node.getAttribute('Id') === id);
  const target = link?.getAttribute('Target');
  if (!target || link.getAttribute('TargetMode') === 'External') throw Error('Không xác định được vị trí sheet BM8.');
  const path = new URL(target, 'https://workbook.invalid/xl/workbook.xml');
  if (path.origin !== 'https://workbook.invalid') throw Error('Vị trí sheet BM8 không hợp lệ.');
  return path.pathname.slice(1);
}

function readCellText(cell, shared) {
  if (cell?.getAttribute('t') === 's') {
    const index = childrenByName(cell, 'v')[0]?.textContent;
    if (index == null) return '';
    return childrenByName(shared[Number(index)] ?? cell, 't').map(node => node.textContent).join('');
  }
  return childrenByName(cell ?? { getElementsByTagNameNS: () => [] }, 't').map(node => node.textContent).join('');
}

function escapeXml(text) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(text)) throw Error('Nội dung có ký tự Excel không hỗ trợ.');
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function fillBm8Workbook(input, notes) {
  const active = bm8Fields.filter(({ cell }) => notes[cell]?.trim());
  if (!active.length) throw Error('Nhập ít nhất một dòng ghi nhận.');
  const parts = unzipSync(input);
  const path = readBm8Sheet(parts);
  let xml = readPart(parts, path);
  const sheet = parseXml(xml);
  const shared = parts['xl/sharedStrings.xml']
    ? childrenByName(parseXml(readPart(parts, 'xl/sharedStrings.xml')), 'si') : [];
  const cells = new Map(childrenByName(sheet, 'c').map(node => [node.getAttribute('r'), node]));
  const heading = readCellText(cells.get('A43'), shared);
  if (!heading.includes('Nội dung ghi nhận kết quả kiểm kê')) throw Error('Mục VI của BM8 không khớp với mẫu đã đối chiếu.');

  for (const { cell, prefix } of active) {
    if (!readCellText(cells.get(cell), shared).startsWith(prefix.trimEnd())) {
      throw Error(`Ô ${cell} không khớp nội dung của mẫu BM8.`);
    }
    const pattern = new RegExp(`<c(\\s+[^>]*\\br="${cell}"[^>]*)>(<v>\\d+</v>|<is>[\\s\\S]*?</is>)</c>`);
    if (!pattern.test(xml)) throw Error(`Không thể cập nhật an toàn ô ${cell} của BM8.`);
    xml = xml.replace(pattern, (_source, attributes) => {
      const style = attributes.replace(/\s+t="(?:s|inlineStr)"/, '');
      return `<c${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(prefix + notes[cell].trim())}</t></is></c>`;
    });
  }
  parts[path] = strToU8(xml);
  return zipSync(parts, { level: 6 });
}

import { supabase } from './supabase';
import { imports } from './clkkImports';
import { readClkkFile } from './clkkData';
import { readClkkSchedules } from './clkkQueries';

export const resetStampKey = 'v10.clkk.folder-reset-at';
const receiptPrefix = 'v10.clkk.folder-receipt.';
const syncLock = 'v10.clkk.folder-write';
const names = {
  'lich kk': 'schedule', 'lich kiem ke': 'schedule',
  'up file trc va trong thang kk': 'sap', 'doanh thu va clkk sap': 'sap',
  'hcxl': 'hcxl', 'gt hcxl': 'hcxl',
  'ds nhan su': 'staff', 'danh muc nhan su': 'staff',
};

export function folderFileKind(filename) {
  if (!/\.xlsx?$/i.test(filename) || filename.startsWith('~$')) return null;
  const name = filename.replace(/\.xlsx?$/i, '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replaceAll('đ', 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  return Object.hasOwn(names, name) ? names[name] : null;
}

export function withFolderWriteLock(task) {
  return globalThis.navigator?.locks ? navigator.locks.request(syncLock, task) : task();
}

async function contentHash(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function syncFile(kind, file, resetAt, cancelled) {
  const config = imports[kind];
  const bytes = await file.arrayBuffer();
  const key = receiptPrefix + kind + '.' + await contentHash(bytes);
  const receipts = JSON.parse(localStorage.getItem(key) ?? '[]');
  if (receipts.includes('*') || cancelled()) return {};
  const rows = await readClkkFile({ arrayBuffer: async () => bytes }, config.parse);
  let payload = rows;
  let completed = ['*'];
  let pending = [];
  if (kind === 'hcxl') {
    const remaining = rows.filter(row => !receipts.includes(row.ma_ch));
    if (!remaining.length) return {};
    const periods = new Map(remaining.map(row => [row.ma_ch, []]));
    const codes = [...periods.keys()];
    for (let i = 0; i < codes.length; i += 100) {
      for (const row of await readClkkSchedules(codes.slice(i, i + 100))) periods.get(row.ma_ch)?.push(row.ngay_moi);
    }
    payload = remaining.filter(row => periods.get(row.ma_ch).length === 1)
      .map(row => ({ ...row, ngay_moi: periods.get(row.ma_ch)[0] }));
    completed = payload.map(row => row.ma_ch);
    pending = remaining.filter(row => periods.get(row.ma_ch).length !== 1)
      .map(row => `${row.ma_ch} ${periods.get(row.ma_ch).length ? '(nhiều kỳ)' : '(thiếu lịch)'}`);
  }
  if (payload.length && !cancelled()) {
    const { error } = await supabase.rpc('v10_clkk_folder_write', {
      p_kind: kind, p_rows: payload, p_reset_at: resetAt, p_modified_at: new Date(file.lastModified).toISOString(),
    });
    if (error) throw error;
    localStorage.setItem(key, JSON.stringify([...receipts, ...completed]));
    return { saved: payload.length, pending };
  }
  return { pending };
}

export async function syncClkkFolder(directory, cancelled) {
  return withFolderWriteLock(async () => {
    const { data, error } = await supabase.from('v10_clkk_folder_state').select('reset_at').maybeSingle();
    if (error) throw error;
    const resetAt = data?.reset_at ?? null;
    const cutoff = Math.max(Number(localStorage.getItem(resetStampKey) ?? 0), resetAt ? Date.parse(resetAt) : 0);
    const issues = [];
    let saved = 0;
    const candidates = [];
    for await (const entry of directory.values()) {
      if (cancelled()) return { saved, issues };
      const kind = entry.kind === 'file' && folderFileKind(entry.name);
      if (!kind) continue;
      try {
        const file = await entry.getFile();
        if (file.lastModified > cutoff && Date.now() - file.lastModified >= 2000) candidates.push({ kind, file });
      } catch (error) {
        issues.push(`${entry.name}: ${error.message}`);
      }
    }
    candidates.sort((a, b) => (a.kind === 'hcxl') - (b.kind === 'hcxl') || a.file.lastModified - b.file.lastModified);
    for (const { kind, file } of candidates) {
      if (cancelled()) break;
      try {
        const result = await syncFile(kind, file, resetAt, cancelled);
        saved += result.saved ?? 0;
        if (result.pending?.length) issues.push(`${file.name}: ${result.pending.join(', ')}. Xử lý trong mục nhập HCXL.`);
      } catch (error) {
        issues.push(`${file.name}: ${error.message}`);
      }
    }
    return { saved, issues };
  });
}

import { supabase } from './supabase';
import { imports } from './clkkImports';
import { readClkkFile } from './clkkData';

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

async function syncFile(kind, file, resetAt, cancelled, activeSchedule, scheduleRows) {
  const config = imports[kind];
  const bytes = await file.arrayBuffer();
  const key = receiptPrefix + kind + '.' + await contentHash(bytes);
  const receipts = JSON.parse(localStorage.getItem(key) ?? '[]');
  if (receipts.includes('*') || cancelled()) return {};
  const rows = scheduleRows ?? await readClkkFile({ arrayBuffer: async () => bytes }, config.parse);
  let payload = rows;
  let completed = ['*'];
  let pending = [];
  if (kind === 'hcxl') {
    payload = [];
    completed = [];
    for (const row of rows) {
      const days = activeSchedule.get(row.ma_ch) ?? [];
      if (days.length !== 1) {
        pending.push(`${row.ma_ch} ${days.length ? '(nhiều kỳ trong file lịch)' : '(không có trong file lịch)'}`);
        continue;
      }
      const [day] = days;
      const receipt = `${row.ma_ch}|${day}`;
      if (receipts.includes(receipt)) continue;
      payload.push({ ...row, ngay_moi: day });
      completed.push(receipt);
    }
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
    candidates.sort((a, b) => a.file.lastModified - b.file.lastModified || a.file.name.localeCompare(b.file.name));
    const scheduleFile = candidates.filter(item => item.kind === 'schedule').at(-1)?.file;
    const activeSchedule = new Map();
    if (scheduleFile && !cancelled()) {
      try {
        const scheduleRows = await readClkkFile(scheduleFile, imports.schedule.parse);
        const result = await syncFile('schedule', scheduleFile, resetAt, cancelled, activeSchedule, scheduleRows);
        saved += result.saved ?? 0;
        for (const row of scheduleRows) {
          if (!activeSchedule.has(row.ma_ch)) activeSchedule.set(row.ma_ch, []);
          activeSchedule.get(row.ma_ch).push(row.ngay_moi);
        }
      } catch (error) {
        issues.push(`${scheduleFile.name}: ${error.message}`);
      }
    }
    for (const { kind, file } of candidates) {
      if (cancelled()) break;
      if (kind === 'schedule') continue;
      try {
        const result = await syncFile(kind, file, resetAt, cancelled, activeSchedule);
        saved += result.saved ?? 0;
        if (result.pending?.length) issues.push(`${file.name}: ${result.pending.join(', ')}. Kiểm tra Lịch KK.xlsx.`);
      } catch (error) {
        issues.push(`${file.name}: ${error.message}`);
      }
    }
    return { saved, issues };
  });
}

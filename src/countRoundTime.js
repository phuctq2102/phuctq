import * as XLSX from 'xlsx';

function localTimestamp(year, month, day, hour, minute, second) {
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day || check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
  return new Date(check.getTime() - 7 * 3600000).toISOString();
}

export function parseCountTimestamp(value, date1904 = false) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!date || date.y < 1900) return null;
    return localTimestamp(date.y, date.m, date.d, date.H, date.M, date.S);
  }

  const text = String(value).trim();
  const localDate = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?$/i);
  if (localDate) {
    const [, day, month, year, hours, minute, second, period] = localDate;
    let hour = Number(hours);
    if (period) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (/^(PM|CH)$/i.test(period) ? 12 : 0);
    }
    return localTimestamp(+year, +month, +day, hour, +minute, +(second || 0));
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!iso) return null;
  const [, year, month, day, hour, minute, second, offset] = iso;
  const local = localTimestamp(+year, +month, +day, +hour, +minute, +(second || 0));
  if (!local || !offset) return local;
  const instant = new Date(text.replace(' ', 'T'));
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

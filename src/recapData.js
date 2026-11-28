export const recapLossRate = 0.003;
export const recapRowKey = row => `${row.ma_ch}|${row.ngay_moi}`;

export function prepareRecapRows(rows) {
  return rows.map(row => {
    const complete = row.tinh_trang == null && row.clkk != null && row.doanh_thu != null;
    const ratio = complete && Number(row.doanh_thu) > 0 ? Number(row.clkk) / Number(row.doanh_thu) : null;
    const difference = ratio == null ? null : Number(row.clkk) + Number(row.doanh_thu) * recapLossRate;
    const excess = difference == null ? null : difference < -0.000001 ? difference : 0;
    return { ...row, complete, ratio, excess, exceeds: excess < 0 };
  });
}

export function recapInsights(rows) {
  const biggest = (current, next, field, compare) => next[field] != null
    && (!current || compare(Number(next[field]), Number(current[field]))) ? next : current;
  let largestLoss = null;
  let largestExcess = null;
  let highestRatio = null;
  let highestHcxl = null;
  let missingSap = 0;
  let exceeds = 0;
  let complete = 0;
  for (const row of rows) {
    if (row.complete) {
      complete++;
      if (Number(row.clkk) < 0) largestLoss = biggest(largestLoss, row, 'clkk', (a, b) => a < b);
      if (row.ratio < 0) highestRatio = biggest(highestRatio, row, 'ratio', (a, b) => a < b);
    }
    if (row.tinh_trang === 'Thiếu dữ liệu SAP') missingSap++;
    if (row.exceeds) {
      exceeds++;
      largestExcess = biggest(largestExcess, row, 'excess', (a, b) => a < b);
    }
    if (Number(row.hcxl) > 0) highestHcxl = biggest(highestHcxl, row, 'hcxl', (a, b) => a > b);
  }
  return { stores: new Set(rows.map(row => row.ma_ch)).size, largestLoss, largestExcess, highestRatio, highestHcxl, missingSap, exceeds, complete };
}

export function sortRecapRows(rows, order) {
  const newest = (a, b) => b.ngay_moi.localeCompare(a.ngay_moi) || a.ma_ch.localeCompare(b.ma_ch, 'vi');
  if (order === 'date') return [...rows].sort(newest);
  const direction = order === 'hcxl' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a[order];
    const right = b[order];
    if (left == null && right == null) return newest(a, b);
    if (left == null) return 1;
    if (right == null) return -1;
    return direction * (Number(left) - Number(right)) || newest(a, b);
  });
}

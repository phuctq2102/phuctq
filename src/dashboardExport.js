import * as XLSX from 'xlsx';

export function buildDashboardWorkbook({ inventory, catalog, summary, overview, industry, period, totals, periodCategories, now = new Date() }) {
  const wb = XLSX.utils.book_new();
  const money = '#,##0;[Red]-#,##0;0';
  const qty = '#,##0.###;[Red]-#,##0.###;0';
  const add = (name, headers, rows, widths, formats = {}) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = widths.map(wch => ({ wch }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    for (let r = 1; r <= rows.length; r++) for (const [c, z] of Object.entries(formats)) {
      const cell = ws[XLSX.utils.encode_cell({r, c: Number(c)})];
      if (cell?.t === 'n') cell.z = z;
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const scope = industry ? `${catalog.get(industry)?.ten_nganh || industry} (${industry})` : 'Tất cả MCH3';
  add('Dashboard', ['Chỉ tiêu', 'Giá trị'], [
    ['Nguồn', 'DSCL gốc'], ['Phạm vi', scope], ['Thời điểm xuất', now.toLocaleString('vi-VN')],
    ['MCH2', 'Toàn bộ DSCL (giống Dashboard)'], ['Tổng mã sản phẩm', summary.productCount],
    ['Tổng lệch âm', summary.negative], ['Tổng lệch dương', summary.positive], ['Chênh lệch ròng', summary.positive + summary.negative]
  ], [30, 52], {1: money});
  if (period && totals) {
    add('CLKK ca ky', ['Chỉ tiêu', 'Giá trị'], [
      ['Mã SAP', period.ma_ch],
      ['Ngày kiểm kê', period.ngay_moi],
      ['Nguồn', 'SAP · Ngày D tạm tính 0'],
      ['Thời điểm cắt dữ liệu SAP tháng T', 'Chưa xác nhận'],
      ['Tháng thiếu dữ liệu', totals.missing.join(', ')],
      ['MCH2 chưa phân loại', totals.invalidCategory ? 'Có' : 'Không'],
      ['Doanh thu không Fresh', totals.revenue ?? 'N/A'],
      ['CLKK không Fresh', totals.total ?? 'N/A'],
      ['Tỷ lệ CLKK / doanh thu', totals.ratio == null ? 'N/A' : new Intl.NumberFormat('vi-VN', {style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2}).format(totals.ratio)],
      ['CL không Fresh trước tháng T', totals.before ?? 'N/A'],
      ['CL không Fresh tháng T + D', totals.during ?? 'N/A'],
      ['CL Fresh cả kỳ', totals.fresh ?? 'N/A'],
      ['Vượt định mức 0,30%', totals.excess ?? 'N/A'],
    ], [39, 35], {1: money});
  }
  if (periodCategories) {
    add('MCH2 ca ky', ['Ngành hàng', 'Netoff', 'GT MCH3', 'Doanh thu'],
      periodCategories.departments.map(row => [row.name, row.net, row.value, row.revenue]),
      [42, 20, 20, 20], {1:money,2:money,3:money});
    add('MCH3 ca ky', ['Ngành hàng', 'Lệch âm', 'Lệch dương', 'Netoff', 'GT MCH3', 'Tỉ lệ MCH3'],
      periodCategories.categories.map(row => [[row.name, row.parent].filter(Boolean).join(' · '), null, null, row.net, row.value, null]),
      [55, 20, 20, 20, 20, 18], {3:money,4:money});
  }
  add('MCH2', ['Mã MCH2','Tên MCH2','SL mã','Lệch âm','Lệch dương','Ròng','Tỉ trọng'], overview.parents.map(r => [r.code,r.name,r.productCount,r.negative,r.positive,r.net,r.share]), [18,38,14,20,20,20,14], {3:money,4:money,5:money,6:'0.0%'});
  add('MCH3', ['Mã MCH3','Ngành hàng','Dòng DSCL','Lệch âm','Lệch dương','Ròng'], summary.industries.map(r => [r.code,r.name,r.count,r.negative,r.positive,r.net]), [18,38,15,20,20,20], {3:money,4:money,5:money});
  const ranking = (name, rows) => add(name,['Hạng','Mã SP','Tên SP','SL sổ','SL đếm','SL chênh lệch','GT chênh lệch'],rows.map((r,i)=>[i+1,r.code,r.name,r.book,r.counted,r.counted-r.book,r.value]),[10,18,65,15,15,18,22],{3:qty,4:qty,5:qty,6:money});
  ranking('TOP_10_AM', summary.negativeTop);
  ranking('TOP_10_DUONG', summary.positiveTop);
  add('DATA',['Mã SP','Tên SP','Mã MCH3','Tên MCH3','Mã MCH2','Tên MCH2','SL sổ','SL đếm','SL chênh lệch','GT chênh lệch','Trong bộ lọc'],inventory.map(r=>{
    const code=String(r.nhom_vat_tu??'').trim(), c=catalog.get(code), book=Number(r.sl_so)||0, counted=Number(r.sl_dem)||0;
    return [String(r.ma_sp??'').trim(),String(r.ten_sp??''),code,c?.ten_nganh||code,c?.ma_mch2||'',c?.ten_mch2||'',book,counted,counted-book,Number(r.gt_chenh_lech)||0,!industry||code===industry?'Có':'Không'];
  }),[18,65,18,38,18,38,15,15,18,22,18],{6:qty,7:qty,8:qty,9:money});
  return wb;
}

export function exportDashboard(options) {
  const now = new Date();
  const date = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');
  XLSX.writeFile(buildDashboardWorkbook({...options, now}), `Dashboard_KiemKe_${date}.xlsx`, {compression:true});
}

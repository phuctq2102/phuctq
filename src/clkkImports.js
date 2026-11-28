import { parseHcxl, parseSap, parseSchedule, parseStaff } from './clkkData';

export const imports = {
  schedule: { label: 'Lịch kiểm kê toàn hệ thống', table: 'v10_clkk_lich', key: 'ma_ch,ngay_moi', parse: parseSchedule, unit: 'lịch cửa hàng' },
  sap: { label: 'Doanh thu và CLKK SAP', table: 'v10_clkk_sap', key: 'ma_ch,thang', parse: parseSap, unit: 'nhóm cửa hàng/tháng' },
  hcxl: { label: 'Hàng chờ xử lý (HCXL, tùy chọn)', table: 'v10_clkk_hcxl', key: 'ma_ch,ngay_moi', parse: parseHcxl, allowEmpty: true, unit: 'cửa hàng' },
  staff: { label: 'Danh mục nhân sự', table: 'v10_clkk_nhan_su', key: 'ma_ch,mnv', parse: parseStaff, unit: 'nhân viên' },
};

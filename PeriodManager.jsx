import React, { useState } from 'react';

// Chế độ an toàn: chỉ hiển thị giao diện, KHÔNG gọi Supabase để xóa dữ liệu.
export default function PeriodManager({ onMessage }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="panel period-manager">
      <div className="period-heading">
        <div><b>Quản lý kỳ kiểm kê</b><small>Reset kỳ kiểm kê — chế độ an toàn, chưa xóa dữ liệu</small></div>
        <span className="period-note">BC giữ nguyên</span>
      </div>
      <div className="period-actions">
        <button type="button" onClick={() => setConfirming(true)}>↻ Reset kỳ kiểm kê</button>
      </div>
      <small className="period-warning">Chế độ thử nghiệm: không xóa DSCL, CT_KV, phân công, điều chỉnh, Final hoặc bất kỳ bảng nào trên Supabase. Không tạo bản lưu khi đóng sổ.</small>
      {confirming && (
        <div role="dialog" aria-label="Xác nhận Reset kỳ kiểm kê" style={{marginTop:12,padding:16,border:'1px solid #d8e1ec',borderRadius:10,background:'#fff'}}>
          <b>Reset kỳ kiểm kê (bản thử)</b>
          <p>Trong phiên bản này, Reset chỉ để kiểm tra giao diện. Dữ liệu hiện tại vẫn được giữ nguyên 100%.</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" onClick={() => {setConfirming(false);onMessage?.('Đã thử nút Reset an toàn. Không có dữ liệu nào bị xóa trên Supabase.');}}>Xác nhận thử (không xóa)</button>
            <button type="button" className="outline" onClick={() => setConfirming(false)}>Hủy</button>
          </div>
        </div>
      )}
    </section>
  );
}

import React, {useState} from 'react';
// RESET_SAFE_BUILD_241126 - Chỉ giao diện; không gọi Supabase.
export default function PeriodManager({onMessage}) {
  const [confirming,setConfirming]=useState(false);
  return <section className="panel" data-reset-version="RESET_SAFE_BUILD_241126">
    <div className="toolbar" style={{justifyContent:'space-between',alignItems:'center'}}>
      <div><b>Quản lý kỳ kiểm kê</b><p style={{margin:'4px 0',fontSize:12,color:'#64748b'}}>Reset an toàn — chưa xóa dữ liệu</p></div>
      <span style={{fontSize:12,color:'#15803d'}}>BC giữ nguyên</span>
    </div>
    <div className="toolbar"><button type="button" onClick={()=>setConfirming(true)}>↻ Reset kỳ kiểm kê (thử)</button></div>
    <small className="period-warning">Chế độ thử: không xóa DSCL, CT_KV, BC, Final, phân công hoặc dữ liệu Supabase.</small>
    {confirming&&<div role="dialog" aria-label="Xác nhận Reset kỳ kiểm kê" style={{marginTop:12,padding:16,border:'1px solid #d8e1ec',borderRadius:10}}>
      <b>Xác nhận thử Reset</b><p>Thao tác này chỉ kiểm tra giao diện. Không xóa dữ liệu.</p>
      <div className="toolbar"><button type="button" onClick={()=>{setConfirming(false);onMessage?.('Đã thử Reset an toàn. Không có dữ liệu nào bị xóa.')}}>Xác nhận thử (không xóa)</button><button type="button" className="outline" onClick={()=>setConfirming(false)}>Hủy</button></div>
    </div>}
  </section>;
}

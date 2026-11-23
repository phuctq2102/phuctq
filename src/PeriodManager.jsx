import React,{useState} from 'react';
import {supabase} from './supabase';
// RESET_LIVE_241126: only executes on explicit admin confirmation.
export default function PeriodManager({admin,onMessage}) {
 const [confirming,setConfirming]=useState(false);
 const [phrase,setPhrase]=useState('');
 const [busy,setBusy]=useState(false);
 async function resetPeriod(){
  if(!admin||busy||phrase.trim()!=='RESET')return;
  setBusy(true);
  try{
   const {data,error}=await supabase.rpc('v10_reset_ky_kiem_ke');
   if(error)throw error;
   if(data!==true)throw Error('Supabase không xác nhận Reset thành công.');
   setConfirming(false);setPhrase('');
   onMessage?.('Đã Reset kỳ kiểm kê trên Supabase. BC, tài khoản và cấu hình được giữ nguyên. Hãy tải lại trang trước khi upload kỳ mới.');
  }catch(e){onMessage?.('Reset KHÔNG thành công: '+e.message)}finally{setBusy(false)}
 }
 return <section className="panel" data-reset-version="RESET_LIVE_241126">
  <div className="toolbar" style={{justifyContent:'space-between',alignItems:'center'}}>
   <div><b>Quản lý kỳ kiểm kê</b><p style={{margin:'4px 0',fontSize:12,color:'#64748b'}}>Reset trực tiếp trên Supabase · Không lưu lịch sử</p></div>
   <span style={{fontSize:12,color:'#15803d'}}>BC giữ nguyên</span>
  </div>
  <div className="toolbar"><button type="button" disabled={!admin||busy} onClick={()=>setConfirming(true)}>↻ Reset kỳ kiểm kê</button></div>
  <small className="period-warning">Chỉ Admin. Reset xóa dữ liệu kỳ cũ; giữ BC, tài khoản và cấu hình. Không thể hoàn tác.</small>
  {confirming&&<div role="dialog" aria-label="Xác nhận Reset kỳ kiểm kê" style={{marginTop:12,padding:16,border:'1px solid #dc2626',borderRadius:10}}>
   <b style={{color:'#b91c1c'}}>Xác nhận xóa dữ liệu kỳ kiểm kê</b>
   <p>Thao tác này xóa vĩnh viễn DSCL, CT_KV, phân công, điều chỉnh, đếm thêm, Final, xác nhận Admin và nhật ký kỳ cũ trên Supabase. Không xóa BC, tài khoản hoặc cấu hình.</p>
   <label>Nhập chính xác <b>RESET</b> để xác nhận<input value={phrase} disabled={busy} autoComplete="off" onChange={e=>setPhrase(e.target.value)} placeholder="RESET"/></label>
   <div className="toolbar" style={{marginTop:12}}><button type="button" disabled={busy||phrase.trim()!=='RESET'} onClick={resetPeriod}>{busy?'Đang Reset...':'Xác nhận xóa dữ liệu'}</button><button type="button" className="outline" disabled={busy} onClick={()=>{setConfirming(false);setPhrase('')}}>Hủy</button></div>
  </div>}
 </section>;
}

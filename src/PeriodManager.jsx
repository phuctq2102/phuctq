import React,{useState} from 'react';
import {supabase} from './supabase';
import {resetStampKey,withFolderWriteLock} from './clkkFolderSync';
export default function PeriodManager({admin,onMessage,onNewPeriod}) {
 const [confirming,setConfirming]=useState(false);
 const [phrase,setPhrase]=useState('');
 const [busy,setBusy]=useState(false);
 async function resetPeriod(){
  if(!admin||busy||phrase.trim()!=='RESET')return;
  setBusy(true);
  try{
   await withFolderWriteLock(async()=>{
    const {data,error}=await supabase.rpc('v10_reset_ky_kiem_ke',{p_confirmation:phrase.trim()});
    if(error)throw error;
    if(data!==true)throw Error('Supabase không xác nhận Reset thành công.');
    try { localStorage.setItem(resetStampKey,String(Date.now())); }
    catch { /* Reset is already committed. */ }
    setConfirming(false);setPhrase('');
    onNewPeriod?.();
   });
   onMessage?.('Đã xóa dữ liệu kiểm kê trên Supabase. Dữ liệu BC vẫn còn.');
  }catch(e){onMessage?.('Reset KHÔNG thành công: '+e.message)}finally{setBusy(false)}
 }
 return <section className="panel">
  <div className="toolbar" style={{justifyContent:'space-between',alignItems:'center'}}>
   <div><b>Quản lý kỳ kiểm kê</b><p style={{margin:'4px 0',fontSize:12,color:'#64748b'}}>Xóa dữ liệu kiểm kê đã nhập và lịch sử đóng sổ</p></div>
   <span style={{fontSize:12,color:'#15803d'}}>BC giữ nguyên</span>
  </div>
  <div className="toolbar"><button type="button" disabled={!admin||busy} onClick={()=>setConfirming(true)}>↻ Reset kỳ kiểm kê</button></div>
  <small className="period-warning">Chỉ Admin có thể Reset. Dữ liệu kiểm kê đã xóa không thể khôi phục từ ứng dụng.</small>
  {confirming&&<div role="dialog" aria-label="Xác nhận Reset kỳ kiểm kê" style={{marginTop:12,padding:16,border:'1px solid #dc2626',borderRadius:10}}>
   <b style={{color:'#b91c1c'}}>Xác nhận xóa dữ liệu kỳ kiểm kê</b>
   <p>Reset xóa DSCL, CT_KV, phân công, đếm, điều chỉnh, Final, nhật ký, danh mục ngành hàng, lịch kiểm kê, doanh thu và CLKK SAP, HCXL, danh mục nhân sự, bản lưu và lịch sử đóng sổ trên Supabase. BC, tài khoản đăng nhập và cấu hình hệ thống được giữ lại.</p>
   <label>Nhập chính xác <b>RESET</b> để xác nhận<input value={phrase} disabled={busy} autoComplete="off" onChange={e=>setPhrase(e.target.value)} placeholder="RESET"/></label>
   <div className="toolbar" style={{marginTop:12}}><button type="button" disabled={busy||phrase.trim()!=='RESET'} onClick={resetPeriod}>{busy?'Đang Reset...':'Xác nhận xóa dữ liệu'}</button><button type="button" className="outline" disabled={busy} onClick={()=>{setConfirming(false);setPhrase('')}}>Hủy</button></div>
  </div>}
 </section>;
}

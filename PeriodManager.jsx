import React,{useEffect,useState} from 'react';
import {supabase,fetchAll} from './supabase';
import {summarizeFinal,pickQrBarcode} from './FinalView';

const key=v=>String(v??'').trim();
async function computedFinal(){
 const [dc,pc,ds,ct,bc]=await Promise.all(['dieu_chinh','phan_cong','dscl','ct_kv','bc'].map(t=>fetchAll(t)));
 const products=new Map(ds.map(p=>[key(p.ma_sp),p]));
 return summarizeFinal(pc,products,dc,ct).map(r=>({...r,qr_value:pickQrBarcode(r.ma_sp,r.dvt,ct,bc)}));
}
export default function PeriodManager({onMessage,onNewPeriod}){
 const [list,setList]=useState([]),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false);
 async function refresh(){try{const {data,error}=await supabase.from('v10_ky_kiem_ke').select('id,ma_ch,ngay_dong,dong_luc,sync_count').order('dong_luc',{ascending:false}).limit(100);if(error)throw error;setList(data||[])}catch(e){onMessage('Chưa cấu hình quản lý kỳ: '+e.message+' — chạy file SQL 04_QUAN_LY_KY_KIEM_KE.sql trong Supabase trước.')}}
 useEffect(()=>{refresh()},[]);
 async function closePeriod(){
  if(!window.confirm('ĐÓNG SỔ: lưu DSCL, CT_KV, ĐIỀU CHỈNH, FINAL và các bảng phụ lên Supabase? Dữ liệu làm việc chưa bị xóa.'))return;
  setBusy(true);
  try{onMessage('Đang tổng hợp Final và đóng sổ, vui lòng không thoát trang...');const final=await computedFinal();
   const {data,error}=await supabase.rpc('v10_dong_so',{p_final:final});if(error)throw error;
   onMessage('Đóng sổ thành công: '+(data?.[0]?.ma_ch||'')+'. Dữ liệu đã được lưu trên Supabase, chưa xóa dữ liệu làm việc.');await refresh();
  }catch(e){onMessage('Không đóng sổ được: '+e.message)}finally{setBusy(false)}
 }
 async function startNew(){
  if(!list.length){onMessage('Cần đóng sổ thành công trước khi bắt đầu kỳ mới.');return;}
  const latest=list[0];
  const phrase=window.prompt(`XÓA dữ liệu làm việc kỳ hiện tại sau khi đã lưu ở ${latest.ma_ch} ngày ${latest.ngay_dong}. BC và USERS giữ nguyên. Nhập BAT DAU KY MOI để xác nhận:`);
  if(phrase!=='BAT DAU KY MOI')return;
  setBusy(true);
  try{const {error}=await supabase.rpc('v10_bat_dau_ky_moi',{p_archive_id:latest.id});if(error)throw error;
   onMessage('Đã dọn dữ liệu kỳ cũ. BC và tài khoản vẫn giữ nguyên. Có thể upload DSCL và CT_KV cửa hàng mới.');onNewPeriod?.();await refresh();
  }catch(e){onMessage('Không bắt đầu kỳ mới được: '+e.message)}finally{setBusy(false)}
 }
 return <section className="panel period-manager"><div className="period-heading"><div><b>Quản lý kỳ kiểm kê</b><small>Đóng sổ → Bắt đầu kỳ mới → Tra cứu lịch sử</small></div><span className="period-note">BC giữ nguyên</span></div>
 <div className="period-actions"><button disabled={busy} onClick={closePeriod}>🔒 Đóng sổ</button><button disabled={busy||!list.length} className="outline" onClick={startNew}>＋ Bắt đầu kỳ mới</button><button disabled={busy} className="outline" onClick={()=>{setExpanded(!expanded);refresh()}}>◷ {expanded?'Ẩn lịch sử':'Xem lịch sử'}</button></div>
 <small className="period-warning">Chỉ xóa dữ liệu làm việc sau khi đóng sổ thành công. Bản lưu Supabase không bị xóa khi bắt đầu kỳ mới. Đồng bộ về Windows cần cấu hình riêng.</small>
 {expanded&&<div className="tablewrap"><table><thead><tr><th>Ngày đóng</th><th>Mã CH</th><th>Mã kỳ</th><th>Đồng bộ Windows</th></tr></thead><tbody>{list.map(k=><tr key={k.id}><td>{new Date(k.dong_luc).toLocaleString('vi-VN')}</td><td>{k.ma_ch}</td><td>{k.id.slice(0,8)}</td><td>{k.sync_count>0?'Đã tải '+k.sync_count+' lần':'Chờ đồng bộ / chưa cấu hình'}</td></tr>)}</tbody></table>{!list.length&&<p>Chưa có kỳ đã đóng.</p>}</div>}
 </section>;
}

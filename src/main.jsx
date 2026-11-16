import PeriodManager from './PeriodManager';
import InventoryList from './InventoryList';
import AssignmentTools from './AssignmentTools';
import Accounts from './Accounts';
import EmployeeCheck from './EmployeeCheck';
import FinalView from './FinalView';
import React,{useEffect,useState,useMemo} from 'react';import{createRoot}from'react-dom/client';import{supabase,configured,fetchAll}from'./supabase';import './style.css';import {parseExcel,replaceTable} from './upload';
const TABLES=[['dscl','Danh sách mã hàng'],['ct_kv','Chi tiết khu vực'],['bc','Barcode bổ sung'],['phan_cong','Phân công'],['dieu_chinh','Điều chỉnh'],['dem_them','Đếm thêm'],['final_lines','Final'],['audit_log','Lịch sử'],['cau_hinh','Cấu hình'],['users','Tài khoản'],['password_manager','Mật khẩu']];
const HEADERS={dscl:['ma_sp','ten_sp','nganh_hang','nhom_vat_tu','dvt_co_ban','sl_so','sl_dem','gt_chenh_lech'],ct_kv:['ma_sp','barcode','ten_sp','khu_vuc','dvt_nhap','sl_nhap','sl_dem','sl_so'],bc:['ma_sp','barcode','ten_sp','khu_vuc','dvt_co_ban','sl_dem'],phan_cong:['ma_sp','mnv','trang_thai','ngay_kiem'],dieu_chinh:['ma_sp','loai_dieu_chinh','khu_vuc_cu','khu_vuc_moi','sl_cu','sl_moi','mnv','trang_thai_duyet'],dem_them:['ma_sp','barcode','khu_vuc','sl_quy_doi','mnv','trang_thai_duyet'],final_lines:['ma_sp','barcode','ten_sp','khu_vuc','sl_so','sl_dem','chenh_lech','gt_chenh_lech','mnv','trang_thai']};
const labels={ma_sp:'Mã SP',ten_sp:'Tên sản phẩm',nganh_hang:'Ngành hàng',nhom_vat_tu:'Nhóm vật tư',dvt_co_ban:'ĐVT cơ bản',sl_so:'SL sổ',gt_chenh_lech:'GT chênh lệch',barcode:'Barcode',khu_vuc:'Khu vực',sl_dem:'SL đếm',sl_nhap:'SL nhập',dvt_nhap:'ĐVT nhập',mnv:'MNV',trang_thai:'Trạng thái'};

function PasswordManager({profile,onMessage}){
 const [target,setTarget]=useState('001');
 const [newPass,setNewPass]=useState('');
 const [ownPass,setOwnPass]=useState('');
 const [working,setWorking]=useState(false);
 const [results,setResults]=useState(null);
 const [confirmBatch,setConfirmBatch]=useState(false);
 const isAdmin=profile?.vai_tro?.toUpperCase()==='ADMIN';
 async function changeOwn(e){
  e.preventDefault();if(ownPass.length<12){onMessage('Mật khẩu cần ít nhất 12 ký tự.');return;}
  setWorking(true);try{const {error}=await supabase.auth.updateUser({password:ownPass});if(error)throw error;setOwnPass('');onMessage('Đã đổi mật khẩu tài khoản đang đăng nhập.')}catch(e){onMessage('Không đổi được: '+e.message)}finally{setWorking(false)}
 }
 async function resetEmployees(batch){
  if(!isAdmin)return;
  if(!batch&&(!/^0(?:0[1-9]|[1-9][0-9])$/.test(target)||newPass.length<12)){onMessage('Chọn mã 001–099 và mật khẩu ít nhất 12 ký tự.');return;}
  if(batch&&!confirmBatch){onMessage('Vui lòng đánh dấu xác nhận đặt lại 99 tài khoản.');return;}
  setWorking(true);setResults(null);
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();if(sessionError||!session)throw Error('Bạn cần đăng nhập lại.');
   const {data,error}=await supabase.functions.invoke('admin-reset-password',{body:batch?{mode:'batch'}:{mode:'single',mnv:target,password:newPass}});
   if(error)throw error;
   if(!data?.ok)throw Error(data?.error||'Không có phản hồi hợp lệ');
   if(batch){setResults(data.results||[]);setConfirmBatch(false);onMessage('Đã xử lý '+(data.results||[]).length+' tài khoản; hãy tải danh sách và bảo quản an toàn.');}
   else{setNewPass('');onMessage('Đã đặt lại mật khẩu nhân viên '+target+'.');}
  }catch(e){onMessage('Đặt lại thất bại: '+e.message)}finally{setWorking(false)}
 }
 function downloadResults(){if(!results)return;const csv='mnv,password,status\n'+results.map(r=>[r.mnv,r.password||'',r.status].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mat_khau_nhan_vien.csv';a.click();URL.revokeObjectURL(url);setResults(null);}
 return <section className="panel"><h2>Quản lý mật khẩu</h2><form onSubmit={changeOwn}><h3>Đổi mật khẩu của tôi</h3><label>Mật khẩu mới (ít nhất 12 ký tự)<input type="password" autoComplete="new-password" value={ownPass} onChange={e=>setOwnPass(e.target.value)}/></label><button disabled={working}>Đổi mật khẩu của tôi</button></form>{isAdmin&&<><hr/><h3>Đặt lại mật khẩu nhân viên</h3><p>Không gửi email, không xóa dữ liệu. Chỉ tài khoản ADMIN được thực hiện.</p><label>Mã nhân viên (001–099)<input value={target} maxLength={3} onChange={e=>setTarget(e.target.value)}/></label><label>Mật khẩu mới (ít nhất 12 ký tự)<input type="password" autoComplete="new-password" value={newPass} onChange={e=>setNewPass(e.target.value)}/></label><button disabled={working} onClick={()=>resetEmployees(false)}>Đặt lại 1 nhân viên</button><hr/><h3>Đặt lại toàn bộ 001–099</h3><p>Mỗi tài khoản sẽ có một mật khẩu ngẫu nhiên riêng. Chỉ thực hiện khi bạn đã sẵn sàng cấp lại mật khẩu cho toàn bộ nhân viên.</p><label><input type="checkbox" checked={confirmBatch} onChange={e=>setConfirmBatch(e.target.checked)}/> Tôi xác nhận đặt lại mật khẩu của 99 nhân viên</label><button disabled={working||!confirmBatch} onClick={()=>resetEmployees(true)}>Đặt lại 99 nhân viên</button>{results&&<p><button onClick={downloadResults}>Tải CSV mật khẩu mới (chỉ hiển thị một lần)</button></p>}</>}</section>;
}

function App(){const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[mnv,setMnv]=useState(''),[password,setPassword]=useState(''),[tab,setTab]=useState('dscl'),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0),[detail,setDetail]=useState(null),[edit,setEdit]=useState({}),[upload,setUpload]=useState(null),[uploadBusy,setUploadBusy]=useState(false),[recoveryMode,setRecoveryMode]=useState(()=>window.location.hash.includes('type=recovery')),[recoveryReady,setRecoveryReady]=useState(false),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');const admin=profile?.vai_tro?.toUpperCase()==='ADMIN';
useEffect(()=>{
 if(!supabase)return;
 let active=true;
 const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
  if(!active)return;
  setSession(s);
  if(event==='PASSWORD_RECOVERY'){
   setRecoveryMode(true);
   setRecoveryReady(true);
   setMessage('');
  }
 });
 supabase.auth.getSession().then(({data,error})=>{
  if(!active)return;
  if(error)setMessage('Không xác thực được liên kết: '+error.message);
  setSession(data?.session??null);
  // Với liên kết khôi phục, không tự chuyển sang giao diện quản trị.
  if(window.location.hash.includes('type=recovery')&&data?.session)setRecoveryReady(true);
 }).catch(error=>{if(active)setMessage('Lỗi kiểm tra phiên: '+error.message)});
 return()=>{active=false;subscription.unsubscribe()};
},[]);
useEffect(()=>{if(!session){setProfile(null);return;}supabase.from('users').select('*').eq('id',session.user.id).maybeSingle().then(({data,error})=>{setProfile(data);if(error)setMessage(error.message)})},[session]);
async function load(){if(!session||!profile||['dscl','password_manager'].includes(tab))return;setBusy(true);setMessage('');setPage(0);try{let filters=(!admin&&tab==='phan_cong')?[['mnv',profile.mnv]]:(!admin&&tab==='users')?[['id',session.user.id]]:[];let result=await fetchAll(tab,filters);setRows(result)}catch(e){setRows([]);setMessage('Không đọc được dữ liệu: '+e.message)}finally{setBusy(false)}}
useEffect(()=>{if(session&&profile)load()},[tab,profile?.id]);
async function chooseFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setUploadBusy(true);setMessage('');try{const parsed=await parseExcel(file,tab);setUpload(parsed)}catch(err){setUpload(null);setMessage('Không đọc được Excel: '+err.message)}finally{setUploadBusy(false)}}
async function commitUpload(){if(!upload||!admin)return;setUploadBusy(true);setMessage('');try{const result=await replaceTable(supabase,tab,upload.rows,(n,total)=>setMessage(`Đang xử lý thay thế ${n}/${total} dòng...`));setMessage(`Đã thay thế ${result} dòng của ${tab}.`);setUpload(null);await load()}catch(err){setMessage('Thay thế thất bại: '+err.message+'')}finally{setUploadBusy(false)}}
async function signIn(e){
 e.preventDefault();setBusy(true);setMessage('');
 try{
  const rawCode=mnv.trim().toUpperCase();
  if(rawCode!=='ADMIN'&&!/^\d{1,3}$/.test(rawCode))throw Error('Mã nhân viên phải là ADMIN hoặc gồm 1–3 chữ số');
  const code=rawCode==='ADMIN'?'ADMIN':rawCode.padStart(3,'0');
  const endpoint=`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/,'')}/functions/v1/mnv-login`;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({mnv:code,password})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token||!body.refresh_token)throw Error(body.error||`Lỗi đăng nhập HTTP ${response.status}`);
  const {error}=await supabase.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
  if(error)throw error;
 }catch(error){setMessage('Không đăng nhập được: '+error.message)}finally{setBusy(false)}
}
async function updateRecoveryPassword(e){
 e.preventDefault();setBusy(true);setMessage('');
 try{
  if(!recoveryReady||!session)throw Error('Liên kết chưa được xác thực hoặc đã hết hạn. Hãy yêu cầu email khôi phục mới.');
  if(newPassword.length<8)throw Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
  if(newPassword!==confirmPassword)throw Error('Hai mật khẩu không trùng nhau.');
  const {error}=await supabase.auth.updateUser({password:newPassword});
  if(error)throw error;
  await supabase.auth.signOut();
  setSession(null);setProfile(null);setRecoveryMode(false);setRecoveryReady(false);
  setNewPassword('');setConfirmPassword('');setPassword('');
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  setMessage('Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.');
 }catch(error){setMessage('Không đổi được mật khẩu: '+error.message)}finally{setBusy(false)}
}
const visible=useMemo(()=>rows.filter(r=>!query||Object.values(r).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase()))),[rows,query]);const headers=HEADERS[tab]||Object.keys(rows[0]||{}).filter(x=>x!=='du_lieu_goc');const paged=visible.slice(page*50,(page+1)*50);
function openRow(r){setDetail(r);setEdit({khu_vuc_moi:r.khu_vuc||'',sl_moi:r.sl_dem??0,ghi_chu:''})}
async function saveCorrection(){if(!detail||!profile)return;setBusy(true);setMessage('');try{if(!['ct_kv','bc'].includes(tab))throw Error('Chỉ hỗ trợ tạo đề xuất điều chỉnh từ CT_KV hoặc BC');const payload={ma_sp:detail.ma_sp,ct_kv_id:tab==='ct_kv'?detail.id:null,loai_dieu_chinh:'SUA_SO_LUONG',khu_vuc_cu:detail.khu_vuc||null,khu_vuc_moi:edit.khu_vuc_moi||null,sl_cu:Number(detail.sl_dem||0),sl_moi:Number(edit.sl_moi),sl_chenh_lech:Number(edit.sl_moi)-Number(detail.sl_dem||0),mnv:profile.mnv,nguoi_cap_nhat:profile.mnv,ghi_chu:edit.ghi_chu||null,trang_thai_duyet:'Không cần duyệt'};if(!Number.isFinite(payload.sl_moi))throw Error('Số lượng không hợp lệ');const {error}=await supabase.from('dieu_chinh').insert(payload);if(error)throw error;setMessage('Đã gửi yêu cầu điều chỉnh. Chỉ có hiệu lực khi quy trình duyệt được triển khai.');setDetail(null)}catch(e){setMessage('Không lưu được: '+e.message)}finally{setBusy(false)}}
if(!configured)return <div className="center"><div className="panel"><h2>Chưa cấu hình Supabase</h2><p>Tạo file <code>.env.local</code> theo <code>.env.example</code> rồi chạy lại ứng dụng.</p></div></div>;
if(recoveryMode)return <div className="center"><form className="panel login" onSubmit={updateRecoveryPassword}><div className="brand">V10 <span>SUPABASE</span></div><h2>Đặt lại mật khẩu</h2><p>{recoveryReady&&session?'Liên kết đã được xác thực. Vui lòng nhập mật khẩu mới.':'Đang xác thực liên kết khôi phục. Nếu không tiếp tục được, hãy yêu cầu email mới.'}</p><label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><label>Xác nhận mật khẩu<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label><button disabled={busy||!recoveryReady||!session}>{busy?'Đang cập nhật...':'Đổi mật khẩu'}</button>{message&&<p className="error">{message}</p>}</form></div>;
if(!session)return <div className="center"><form className="panel login" onSubmit={signIn}><div className="brand">V10 <span>SUPABASE</span></div><h2>Đăng nhập hệ thống kiểm kê</h2><label>Mã nhân viên<input type="text" maxLength={5} placeholder="ADMIN hoặc 001" value={mnv} onChange={e=>setMnv(e.target.value)} required/></label><label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>Đăng nhập</button>{message&&<p className="error">{message}</p>}</form></div>;
return <div className="layout"><aside><div className="brand">V10 <span>SUPABASE</span></div><div className="sub">Quản lý kiểm kê</div><nav>{TABLES.filter(([t])=>admin||['phan_cong','dieu_chinh','dem_them','password_manager'].includes(t)).map(([t,name])=><button className={tab===t?'active':''} key={t} onClick={()=>{setTab(t);setQuery('');setDetail(null);setUpload(null)}}>{name}</button>)}</nav><div className="asidefoot"><small>{profile?.ho_ten||profile?.mnv||'Tài khoản'}</small><small>{profile?.vai_tro||'Chưa được cấp vai trò'}</small><button onClick={()=>supabase.auth.signOut()}>Đăng xuất</button></div></aside><main><header><div><h1>{TABLES.find(x=>x[0]===tab)?.[1]}</h1><p>{admin?'Quản trị viên':'Nhân viên'} · Dữ liệu từ Supabase</p></div><button className="outline" disabled={busy} onClick={load}>↻ Tải lại</button></header>{!profile&&<div className="warning">Tài khoản Auth chưa có hồ sơ trong public.users. Liên hệ Admin để liên kết UUID.</div>}{!admin&&tab==='dieu_chinh'&&<div className="warning">Chỉ xem các dòng mà chính sách RLS cho phép. Quyền ghi và quy trình duyệt cần cấu hình riêng.</div>}{admin&&['dscl','ct_kv','bc'].includes(tab)&&<section className="panel importpanel"><details><summary>Nhập Excel {tab.toUpperCase()} (mở khi cần cập nhật dữ liệu)</summary><div className="importpanel-inner"><h3>Nhập Excel {tab.toUpperCase()}</h3><p>Upload sẽ thay thế toàn bộ dữ liệu cũ của bảng này sau khi tải và kiểm tra thành công. Bảng khác không bị xóa trực tiếp.</p><input type="file" accept=".xlsx,.xls" disabled={uploadBusy} onChange={chooseFile}/>{upload?.table===tab&&<><p><b>{upload.rows.length.toLocaleString('vi-VN')} dòng</b> hợp lệ · Sheet: {upload.sheet}</p><p>Cột nhận diện: {upload.columns.join(', ')}</p><div className="tablewrap"><table><thead><tr>{upload.columns.map(c=><th key={c}>{labels[c]||c}</th>)}</tr></thead><tbody>{upload.rows.slice(0,5).map((r,i)=><tr key={i}>{upload.columns.map(c=><td key={c}>{String(r[c]??'')}</td>)}</tr>)}</tbody></table></div><button disabled={uploadBusy} onClick={commitUpload}>Xác nhận thay thế toàn bộ dữ liệu cũ</button> <button className="outline" disabled={uploadBusy} onClick={()=>setUpload(null)}>Hủy</button></>}{uploadBusy&&<p>Đang xử lý, vui lòng chờ...</p>}</div></details></section>}{admin&&tab==='dscl'&&<PeriodManager onMessage={setMessage} onNewPeriod={()=>{setRows([]);setUpload(null)}}/>}{message&&<div className="notice">{message}</div>}{tab==='dscl'&&admin&&<AssignmentTools onMessage={setMessage}/>} {tab==='password_manager'?<PasswordManager profile={profile} onMessage={setMessage}/>:tab==='final_lines'&&admin?<FinalView/>:tab==='users'&&admin?<Accounts/>:tab==='phan_cong'&&!admin?<EmployeeCheck profile={profile} onMessage={setMessage}/>:tab==='dscl'?<InventoryList admin={admin} profile={profile} onMessage={setMessage}/>:<section className="panel"><div className="toolbar"><input placeholder="Tìm trong dữ liệu đã tải..." value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/><span>{visible.length.toLocaleString('vi-VN')} dòng</span></div><div className="tablewrap"><table><thead><tr>{headers.map(h=><th key={h}>{labels[h]||h}</th>)}<th>Chi tiết</th></tr></thead><tbody>{paged.map((r,i)=><tr key={r.id||i}>{headers.map(h=><td key={h}>{typeof r[h]==='object'?JSON.stringify(r[h]):String(r[h]??'')}</td>)}<td><button className="small" onClick={()=>openRow(r)}>Xem</button></td></tr>)}</tbody></table>{!busy&&!visible.length&&<p className="empty">Chưa có dữ liệu hoặc không có quyền xem.</p>}{busy&&<p className="empty">Đang tải dữ liệu...</p>}</div><div className="pager"><button className="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trước</button><span>Trang {page+1}/{Math.max(1,Math.ceil(visible.length/50))}</span><button className="outline" disabled={(page+1)*50>=visible.length} onClick={()=>setPage(p=>p+1)}>Sau</button></div></section>}{detail&&<div className="overlay" onClick={()=>setDetail(null)}><div className="panel modal" onClick={e=>e.stopPropagation()}><div className="modalhead"><h2>Chi tiết {detail.ma_sp||detail.id}</h2><button className="outline" onClick={()=>setDetail(null)}>Đóng</button></div><div className="fields">{Object.entries(detail).filter(([k])=>k!=='du_lieu_goc').map(([k,v])=><div key={k}><b>{labels[k]||k}</b><span>{typeof v==='object'?JSON.stringify(v):String(v??'')}</span></div>)}</div>{['ct_kv','bc'].includes(tab)&&<div className="editbox"><h3>Gửi đề xuất điều chỉnh</h3><p>Không sửa trực tiếp dữ liệu gốc.</p><label>Khu vực mới<input value={edit.khu_vuc_moi} onChange={e=>setEdit({...edit,khu_vuc_moi:e.target.value})}/></label><label>Số lượng mới<input type="number" value={edit.sl_moi} onChange={e=>setEdit({...edit,sl_moi:e.target.value})}/></label><label>Ghi chú<input value={edit.ghi_chu} onChange={e=>setEdit({...edit,ghi_chu:e.target.value})}/></label><button disabled={busy} onClick={saveCorrection}>Gửi yêu cầu</button></div>}</div></div>}</main></div>}
createRoot(document.getElementById('root')).render(<App/>);

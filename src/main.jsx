import './utilities.css';
import { Button } from './components/ui/button';
import { PackageCheck, LogOut, ListChecks, FileCheck2, ClipboardList, LayoutDashboard, Users } from 'lucide-react';
import PeriodManager from './PeriodManager';
import InventoryList from './InventoryList';
import Dashboard from './Dashboard';
import IndustryImport from './IndustryImport';
import AssignmentTools from './AssignmentTools';
import Accounts from './Accounts';
import EmployeeCheck from './EmployeeCheck';
import FinalView from './FinalView';
import ClkkReport from './ClkkReport';
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{supabase,configured}from'./supabase';import './style.css';import './redesign.css';import {parseExcel,replaceTable} from './upload';
const PAGES=[
 { id:'dscl', label:'Danh sách mã hàng', Icon:ListChecks },
 { id:'dashboard', label:'Dashboard', Icon:LayoutDashboard, adminOnly:true },
 { id:'final_lines', label:'Final', Icon:FileCheck2, adminOnly:true },
 { id:'clkk', label:'Báo cáo CLKK và Biên bản', Icon:FileCheck2, adminOnly:true },
 { id:'phan_cong', label:'Phân công', Icon:ClipboardList, employeeOnly:true },
 { id:'account', label:'Tài khoản & mật khẩu', Icon:Users },
];
const IMPORT_TABLES=[
 ['dscl','Danh sách mã hàng (DSCL)'],
 ['ct_kv','Chi tiết khu vực (CT_KV)'],
 ['bc','Barcode bổ sung (BC)'],
];
function Brand(){return <div className="v10-brand"><span className="v10-mark"><PackageCheck aria-hidden="true" size={23}/></span><span>Kiểm Kê <b>V10</b></span></div>}
const labels={round1_at:'Round 1 · Ngày cập nhật',round2_at:'Round 2 · Ngày cập nhật',nguoi_cap_nhat:'Người cập nhật',nguoi_cap_nhat_round2:'Người cập nhật Round 2',ma_sp:'Mã SP',ten_sp:'Tên sản phẩm',nganh_hang:'Ngành hàng',nhom_vat_tu:'Nhóm vật tư',dvt_co_ban:'ĐVT cơ bản',sl_so:'SL sổ',gt_chenh_lech:'GT chênh lệch',barcode:'Barcode',khu_vuc:'Khu vực',sl_dem:'SL đếm',sl_nhap:'SL nhập',dvt_nhap:'ĐVT nhập',mnv:'MNV',trang_thai:'Trạng thái'};

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

function App(){const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[mnv,setMnv]=useState(''),[password,setPassword]=useState(''),[tab,setTab]=useState('dscl'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[inventoryRevision,setInventoryRevision]=useState(0),[importTable,setImportTable]=useState('dscl'),[upload,setUpload]=useState(null),[uploadBusy,setUploadBusy]=useState(false),[recoveryMode,setRecoveryMode]=useState(()=>window.location.hash.includes('type=recovery')),[recoveryReady,setRecoveryReady]=useState(false),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');const admin=profile?.vai_tro?.toUpperCase()==='ADMIN';
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
async function chooseFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setUploadBusy(true);setMessage('');try{const parsed=await parseExcel(file,importTable);setUpload(parsed)}catch(err){setUpload(null);setMessage('Không đọc được Excel: '+err.message)}finally{setUploadBusy(false)}}
async function commitUpload(){if(!upload||!admin)return;setUploadBusy(true);setMessage('');try{const result=await replaceTable(supabase,importTable,upload.rows,(n,total)=>setMessage(`Đang xử lý thay thế ${n}/${total} dòng...`));setMessage(`Đã thay thế ${result} dòng của ${importTable}.`);setUpload(null);setInventoryRevision(value=>value+1)}catch(err){setMessage('Thay thế thất bại: '+err.message+'')}finally{setUploadBusy(false)}}
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
if(!configured)return <div className="center"><div className="panel"><h2>Chưa cấu hình Supabase</h2><p>Tạo file <code>.env.local</code> theo <code>.env.example</code> rồi chạy lại ứng dụng.</p></div></div>;
if(recoveryMode)return <div className="center"><form className="panel login" onSubmit={updateRecoveryPassword}><Brand/><h2>Đặt lại mật khẩu</h2><p>{recoveryReady&&session?'Liên kết đã được xác thực. Vui lòng nhập mật khẩu mới.':'Đang xác thực liên kết khôi phục. Nếu không tiếp tục được, hãy yêu cầu email mới.'}</p><label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><label>Xác nhận mật khẩu<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label><button disabled={busy||!recoveryReady||!session}>{busy?'Đang cập nhật...':'Đổi mật khẩu'}</button>{message&&<p className="error">{message}</p>}</form></div>;
if(!session)return <div className="center"><form className="panel login" onSubmit={signIn}><Brand/><div className="login-title"><h1>Đăng nhập</h1><p>Nhập mã nhân viên để vào hệ thống kiểm kê.</p></div><label>Mã nhân viên<input type="text" autoComplete="username" maxLength={5} placeholder="ADMIN hoặc 001" value={mnv} onChange={e=>setMnv(e.target.value)} required/></label><label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><Button type="submit" disabled={busy}>{busy?'Đang đăng nhập…':'Đăng nhập'}</Button>{message&&<p className="error">{message}</p>}</form></div>;
const pages=PAGES.filter(page=>{
 if(page.adminOnly)return admin;
 if(page.employeeOnly)return Boolean(profile?.mnv)&&!admin;
 return true;
});
const currentPage=pages.find(page=>page.id===tab)||pages[0];
return (
 <div className="layout">
  <aside>
   <Brand/>
   <nav aria-label="Phân hệ kiểm kê">
    {pages.map(({id,label,Icon})=>(
     <button type="button" key={id} aria-current={currentPage.id===id?'page':undefined}
      className={currentPage.id===id?'active':''} onClick={()=>{setTab(id);setMessage('')}}>
      <Icon size={17} aria-hidden="true"/>{label}
     </button>
    ))}
   </nav>
   <div className="asidefoot">
    <small>{profile?.ho_ten||profile?.mnv||'Tài khoản'}</small>
    <small>{profile?.vai_tro||'Chưa được cấp vai trò'}</small>
    <button type="button" onClick={()=>supabase.auth.signOut()}><LogOut size={16} aria-hidden="true"/>Đăng xuất</button>
   </div>
  </aside>
  <main>
   <header><h1>{currentPage.label}</h1></header>
   {!profile&&<div className="warning">Tài khoản chưa có hồ sơ nhân viên. Liên hệ quản trị viên để được hỗ trợ.</div>}
   {message&&<div className="notice" role="status">{message}</div>}
   {currentPage.id==='dscl'&&<>
    <InventoryList key={inventoryRevision} admin={admin} profile={profile} onMessage={setMessage}/>
    {admin&&<details className="panel inventory-tools">
     <summary>Nhập dữ liệu và quản lý kỳ kiểm kê</summary>
     <div className="inventory-tools-content">
      <section className="importpanel-inner">
       <h2>Nhập Excel</h2>
       <label>Loại dữ liệu <select value={importTable} disabled={uploadBusy} onChange={e=>{setImportTable(e.target.value);setUpload(null)}}>
        {IMPORT_TABLES.map(([id,label])=><option key={id} value={id}>{label}</option>)}
       </select></label>
       <p>Dữ liệu cũ của bảng đã chọn sẽ được thay thế khi nhập thành công.</p>
       <input type="file" aria-label="Chọn tệp Excel" accept=".xlsx,.xls" disabled={uploadBusy} onChange={chooseFile}/>
       {upload?.table===importTable&&<>
        <p><b>{upload.rows.length.toLocaleString('vi-VN')} dòng</b> hợp lệ · Sheet {upload.sheet}</p>
        <div className="tablewrap"><table>
         <thead><tr>{upload.columns.map(column=><th key={column}>{labels[column]||column}</th>)}</tr></thead>
         <tbody>{upload.rows.slice(0,5).map((row,index)=><tr key={index}>{upload.columns.map(column=><td key={column}>{String(row[column]??'')}</td>)}</tr>)}</tbody>
        </table></div>
        <div><Button type="button" disabled={uploadBusy} onClick={commitUpload}>Xác nhận thay thế dữ liệu</Button>{' '}
         <Button type="button" variant="outline" disabled={uploadBusy} onClick={()=>setUpload(null)}>Hủy</Button></div>
       </>}
       {uploadBusy&&<p role="status">Đang xử lý…</p>}
      </section>
      <IndustryImport onSaved={()=>setInventoryRevision(value=>value+1)}/>
      <PeriodManager admin={admin} onMessage={setMessage} onNewPeriod={()=>{setInventoryRevision(value=>value+1);setUpload(null)}}/>
      <AssignmentTools onMessage={setMessage}/>
     </div>
    </details>}
   </>}
   {currentPage.id==='phan_cong'&&<EmployeeCheck profile={profile} onMessage={setMessage}/>}
   {currentPage.id==='dashboard'&&<Dashboard/>}
   {currentPage.id==='final_lines'&&<>
    <Button type="button" variant="outline" onClick={()=>setTab('clkk')}>Mở báo cáo CLKK của kỳ</Button>
    <FinalView/>
   </>}
   {currentPage.id==='clkk'&&<ClkkReport/>}
   {currentPage.id==='account'&&<div className="account-page">
    {admin&&<Accounts/>}
    <PasswordManager profile={profile} onMessage={setMessage}/>
   </div>}
  </main>
 </div>
);
}
createRoot(document.getElementById('root')).render(<App/>);

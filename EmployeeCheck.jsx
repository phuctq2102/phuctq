import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from './supabase';
const str=v=>String(v??'').trim();
const num=v=>Number(v??0)||0;
const fmt=v=>num(v).toLocaleString('vi-VN');
const checked=v=>str(v)==='Đã kiểm';
const accepted=v=>!['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(str(v).toUpperCase());
const unit=v=>str(v).normalize('NFC').toLocaleUpperCase('vi-VN');
const hasBarcode=(v,code)=>str(v).split(';').some(x=>x.trim()===code);
const bars=rows=>[...new Set(rows.flatMap(r=>str(r.barcode).split(';').map(x=>x.trim())).filter(Boolean))].join('; ');
async function read(table,columns,ma_sp){const {data,error}=await supabase.from(table).select(columns).eq('ma_sp',ma_sp).limit(1000);if(error)throw error;return data||[]}
export default function EmployeeCheck({profile,onMessage}){
 const [scanCode,setScanCode]=useState(''),[scanBusy,setScanBusy]=useState(false),[scanOpen,setScanOpen]=useState(false),[scanTarget,setScanTarget]=useState(''),[scanMode,setScanMode]=useState('plus'),[scanRow,setScanRow]=useState(''),[scanNotice,setScanNotice]=useState('');const videoRef=useRef(null),streamRef=useRef(null),scanTimer=useRef(null),scanLock=useRef(false),lastScan=useRef({code:'',at:0});
 const [assign,setAssign]=useState([]),[products,setProducts]=useState(new Map()),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[loading,setLoading]=useState(false),[selected,setSelected]=useState(null),[lines,setLines]=useState([]),[changes,setChanges]=useState([]),[edits,setEdits]=useState({}),[newKv,setNewKv]=useState({khu_vuc:'',sl:''}),[detailLoading,setDetailLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function reload(){if(!profile?.mnv)return;setLoading(true);setError('');try{
  const {data,error:e}=await supabase.from('phan_cong').select('ma_sp,mnv,trang_thai').eq('mnv',profile.mnv).order('ma_sp').limit(5000);if(e)throw e;
  const list=data||[];setAssign(list);const map=new Map();for(let i=0;i<list.length;i+=150){const ids=list.slice(i,i+150).map(r=>r.ma_sp);if(!ids.length)continue;const {data:ds,error:de}=await supabase.from('dscl').select('ma_sp,ten_sp,sl_dem,sl_so,gt_chenh_lech,dvt_co_ban').in('ma_sp',ids);if(de)throw de;(ds||[]).forEach(r=>map.set(str(r.ma_sp),r))}setProducts(map);
 }catch(e){setError('Không tải được phân công: '+e.message)}finally{setLoading(false)}}
 useEffect(()=>{reload()},[profile?.mnv]);
 useEffect(()=>{const onFocus=()=>{if(document.visibilityState==='visible'&&!selected)reload()};window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus)},[profile?.mnv,selected]);
 function stopCamera(){if(scanTimer.current){clearInterval(scanTimer.current);scanTimer.current=null;}if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}setScanOpen(false)}
 useEffect(()=>()=>{if(scanTimer.current)clearInterval(scanTimer.current);if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop())},[]);
 async function startCamera(){
  setError('');if(!('BarcodeDetector' in window)){setError('Trình duyệt chưa hỗ trợ camera BarcodeDetector. Có thể dùng máy quét Bluetooth hoặc nhập Barcode và Enter.');return}
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});streamRef.current=stream;setScanOpen(true);
   setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=stream},0);
   const detector=new window.BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e','qr_code']});
   scanTimer.current=setInterval(async()=>{if(!videoRef.current||videoRef.current.readyState<2||scanLock.current)return;
    scanLock.current=true;try{const codes=await detector.detect(videoRef.current);if(codes.length){const code=str(codes[0].rawValue),now=Date.now();if(code&&(code!==lastScan.current.code||now-lastScan.current.at>1500)){lastScan.current={code,at:now};setScanCode(code);await locateBarcode(code)}}}catch(e){setError('Lỗi quét: '+e.message)}finally{scanLock.current=false}
   },350);
  }catch(e){stopCamera();setError('Không mở được camera: '+e.message+' (cần HTTPS hoặc localhost và quyền Camera).')}
 }
 function applyScan(code,rows,p,preferred=''){
  const candidates=rows.filter(r=>r._source==='CT_KV'&&hasBarcode(r.barcode,code));
  if(!candidates.length){setScanNotice('Đã tìm thấy mã hàng, nhưng Barcode không thuộc dòng CT_KV cụ thể. Chưa tự cộng/trừ.');return}
  const valid=candidates.filter(r=>unit(r.dvt_nhap)===unit(p.dvt_co_ban)&&unit(p.dvt_co_ban));
  if(!valid.length){setError('Barcode có ĐVT nhập khác ĐVT cơ bản DSCL. Không tự cộng/trừ vì chưa có hệ số quy đổi xác thực.');return}
  const row=valid.find(r=>r._key===preferred)||(valid.length===1?valid[0]:null);
  if(!row){setScanNotice('Barcode thuộc nhiều khu vực. Hãy chọn dòng khu vực ở mục Quét nhanh, sau đó quét lại.');return}
  setScanRow(row._key);setScanTarget(code);
  setEdits(old=>{const previous=old[row._key]?.delta===undefined?num(row._saved)-num(row._base):Number(old[row._key].delta);const next=previous+(scanMode==='plus'?1:-1);if(num(row._base)+next<0){setError('SL cuối không thể âm; không thực hiện lần quét này.');return old}return {...old,[row._key]:{...old[row._key],delta:String(next)}}});
  setScanNotice('Đã '+(scanMode==='plus'?'cộng +1':'trừ -1')+' '+p.dvt_co_ban+' cho khu vực '+str(row._kv)+'. Bấm Cập nhật đã kiểm để lưu.');
 }
 async function locateBarcode(raw){const code=str(raw);if(!code||scanBusy)return;setScanBusy(true);setError('');setScanNotice('');try{
  let match=null;for(const table of ['ct_kv','bc']){const {data,error:e}=await supabase.from(table).select('ma_sp,barcode').ilike('barcode','%'+code.replace(/[%_]/g,'')+'%').limit(100);if(e)throw e;match=(data||[]).find(r=>hasBarcode(r.barcode,code)&&assign.some(a=>str(a.ma_sp)===str(r.ma_sp)));if(match)break;}
  if(!match){const found=assign.find(a=>str(a.ma_sp)===code);if(found)match={ma_sp:code};}
  if(!match)throw Error('Không tìm thấy Barcode trong CT_KV/BC của các mã được phân công.');
  const a=assign.find(a=>str(a.ma_sp)===str(match.ma_sp));let rows=lines;
  if(!selected||str(selected.ma_sp)!==str(a.ma_sp)){rows=await open(a)}
  setScanTarget(code);const p=products.get(str(a.ma_sp))||{};
  if(code===str(a.ma_sp)){setScanNotice('QR mã sản phẩm chỉ nhận diện mã; cần quét Barcode CT_KV có ĐVT nhập trùng ĐVT cơ bản để tự +/- 1.');return}
  applyScan(code,rows,p,scanRow);
 }catch(e){setError('Quét Barcode: '+e.message)}finally{setScanBusy(false)}}

 const shown=useMemo(()=>assign.filter(a=>(filter==='all'||(filter==='done')===checked(a.trang_thai))&&(!search||[a.ma_sp,products.get(str(a.ma_sp))?.ten_sp].some(v=>str(v).toLowerCase().includes(search.toLowerCase())))),[assign,products,filter,search]);
 async function open(a){setSelected(a);setScanRow('');setScanNotice('');setLines([]);setChanges([]);setEdits({});setNewKv({khu_vuc:'',sl:''});setDetailLoading(true);setError('');try{
  const [ct,bc,dc]=await Promise.all([read('ct_kv','*',a.ma_sp),read('bc','*',a.ma_sp),read('dieu_chinh','*',a.ma_sp)]);
  const p=products.get(str(a.ma_sp))||{};const useBC=(num(p.sl_dem)===0&&bc.length>0)||(!ct.length&&bc.length>0);
  const common=bars([...ct,...bc]);const latest=new Map();dc.filter(accepted).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id))).forEach(c=>{if(c.ct_kv_id!=null)latest.set(str(c.ct_kv_id),c)});
  const normal=(useBC?bc:ct).map((r,i)=>{const ch=latest.get(str(r.id));return {...r,_key:(useBC?'bc':'ct')+'-'+(r.id??i),_source:useBC?'BC':'CT_KV',_saved:num(ch?.sl_moi??r.sl_dem),_base:num(r.sl_dem),_kv:ch?.khu_vuc_moi??r.khu_vuc??'',_barcode:str(r.barcode)||common}});
  const added=dc.filter(c=>accepted(c)&&str(c.loai_dieu_chinh)==='THEM_KV').map(c=>({...c,_key:'new-'+c.id,_source:'KV_MOI',_saved:num(c.sl_moi),_base:0,_kv:c.khu_vuc_moi||'',_barcode:common}));
  setLines([...normal,...added]);setChanges(dc.filter(accepted));return [...normal,...added];
 }catch(e){setError('Không tải được chi tiết: '+e.message)}finally{setDetailLoading(false)}}
 const product=selected?products.get(str(selected.ma_sp))||{}:{};
 // Only the latest saved value for each original row counts; prior edits are history.
 const latestSaved=new Map(),newSaved=new Map();
 for(const c of changes.slice().sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)))){
  if(str(c.loai_dieu_chinh)==='THEM_KV')newSaved.set(str(c.id),c);
  else if(c.ct_kv_id!=null)latestSaved.set(str(c.ct_kv_id),c);
 }
 const deltaSaved=lines.filter(r=>r._source!=='KV_MOI').reduce((s,r)=>s+num(r._saved)-num(r._base),0)+[...newSaved.values()].reduce((s,c)=>s+num(c.sl_moi),0);
 const pendingDelta=lines.reduce((s,r)=>s+(edits[r._key]?.delta===undefined?0:num(edits[r._key].delta)-(num(r._saved)-num(r._base))),0)+(str(newKv.khu_vuc)&&str(newKv.sl)!==''?num(newKv.sl):0);
 const current=num(product.sl_dem)+deltaSaved+pendingDelta;
 const field=(r,k)=>edits[r._key]?.[k]??(k==='sl'?(edits[r._key]?.delta===undefined?r._saved:num(r._base)+num(edits[r._key].delta)):r._kv);
 async function save(status='Đã kiểm'){
  if(!selected||saving)return;setSaving(true);setError('');try{
   const changed=lines.filter(r=>Math.abs(num(field(r,'sl'))-num(r._saved))>1e-9||str(field(r,'kv'))!==str(r._kv));
   if(changed.some(r=>!Number.isFinite(Number(field(r,'sl')))||Number(field(r,'sl'))<0||!Number.isFinite(Number(edits[r._key]?.delta??0))))throw Error('Số lượng thực tế phải là số không âm');
   if(changed.some(r=>!str(field(r,'kv'))))throw Error('Khu vực không được bỏ trống');
   if(changed.some(r=>r._source==='BC'))throw Error('Dòng từ BC chưa có ID CT_KV. Cần bổ sung cơ chế lưu dòng BC trước khi chỉnh sửa.');
   if((str(newKv.khu_vuc)||str(newKv.sl))&&(!str(newKv.khu_vuc)||str(newKv.sl)===''||!Number.isFinite(Number(newKv.sl))||Number(newKv.sl)<0))throw Error('Thêm khu vực: nhập KV và SL quy đổi hợp lệ');
   // Preserve the original CT_KV; corrections are append-only except edits to a newly-added KV.
   for(const r of changed){const sl=Number(field(r,'sl')),kv=str(field(r,'kv'));
    if(r._source==='KV_MOI'){
     const {error}=await supabase.from('dieu_chinh').update({khu_vuc_moi:kv,sl_moi:sl,sl_chenh_lech:sl}).eq('id',r.id).eq('ma_sp',selected.ma_sp);if(error)throw error;
    }else{
     const payload={ma_sp:selected.ma_sp,ct_kv_id:r.id,loai_dieu_chinh:'SUA_SO_LUONG',khu_vuc_cu:r.khu_vuc||null,khu_vuc_moi:kv,sl_cu:num(r._saved),sl_moi:sl,sl_chenh_lech:sl-num(r._saved),mnv:profile.mnv,nguoi_cap_nhat:profile.mnv,ghi_chu:'Kiểm kê nhân viên V10',trang_thai_duyet:'Không cần duyệt'};
     const {error}=await supabase.from('dieu_chinh').insert(payload);if(error)throw error;
    }
   }
   if(str(newKv.khu_vuc)){
    const n=Number(newKv.sl);const payload={ma_sp:selected.ma_sp,ct_kv_id:null,loai_dieu_chinh:'THEM_KV',khu_vuc_cu:null,khu_vuc_moi:str(newKv.khu_vuc),sl_cu:0,sl_moi:n,sl_chenh_lech:n,mnv:profile.mnv,nguoi_cap_nhat:profile.mnv,ghi_chu:'KV mới từ nhân viên',trang_thai_duyet:'Không cần duyệt'};
    const {error}=await supabase.from('dieu_chinh').insert(payload);if(error)throw error;
   }
   const {data,error}=await supabase.from('phan_cong').update({trang_thai:status}).eq('ma_sp',selected.ma_sp).eq('mnv',profile.mnv).select('ma_sp');if(error)throw error;if(!data?.length)throw Error('Không được phép cập nhật trạng thái PHAN_CONG; cần cấu hình RLS.');
   setSelected(null);setScanTarget('');onMessage?.('Đã lưu điều chỉnh và trạng thái '+status);await reload();
  }catch(e){setError('Không lưu được: '+e.message+' (nếu một phần đã lưu, không bấm lại; kiểm tra dữ liệu trước)')}finally{setSaving(false)}}
 return <div className="employee-check"><div className="employee-heading"><h2>TÌM KHU VỰC · Danh sách mã được phân công</h2><button className="outline" onClick={reload}>↻ Tải lại</button></div><div className="panel employee-filter"><input placeholder="Tìm mã SP hoặc tên sản phẩm..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tất cả</option><option value="pending">Chưa kiểm</option><option value="done">Đã kiểm</option></select><span>{shown.length} mã hàng</span></div>{error&&<div className="warning">{error}</div>}<div className="panel" style={{padding:14,marginBottom:12}}><strong>Quét Barcode · Nhập +/- theo ĐVT cơ bản DSCL</strong><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><input style={{flex:'1 1 200px'}} value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')locateBarcode(scanCode)}} placeholder="Quét hoặc nhập Barcode / mã SP"/><button disabled={scanBusy} onClick={()=>locateBarcode(scanCode)}>{scanBusy?'Đang tìm...':'Tìm mã'}</button><button className="outline" onClick={scanOpen?stopCamera:startCamera}>{scanOpen?'Tắt camera':'Mở camera quét'}</button></div>{scanOpen&&<video ref={videoRef} autoPlay playsInline muted style={{width:'100%',maxWidth:420,marginTop:10,borderRadius:8}}/>}<small>Mỗi lần quét Barcode CT_KV có ĐVT nhập đúng ĐVT cơ bản sẽ tự +/- 1. Barcode ĐVT khác cần hệ số quy đổi, hệ thống sẽ cảnh báo thay vì cộng sai.</small></div><div className="panel"><div className="tablewrap"><table><thead><tr><th>Mã SP</th><th>Tên sản phẩm</th><th>SL đếm gốc</th><th>SL sổ</th><th>GT chênh lệch</th><th>Trạng thái</th><th></th></tr></thead><tbody>{shown.map(a=>{const p=products.get(str(a.ma_sp))||{};return <tr key={a.ma_sp}><td><b>{a.ma_sp}</b></td><td className="inv-name">{p.ten_sp||'Chưa có quyền đọc DSCL'}</td><td>{fmt(p.sl_dem)}</td><td>{fmt(p.sl_so)}</td><td>{fmt(p.gt_chenh_lech)}</td><td><span className={'inv-status '+(checked(a.trang_thai)?'done':'pending')}>{a.trang_thai||'Chưa kiểm'}</span></td><td><button className="small" onClick={()=>open(a)}>Kiểm tra</button></td></tr>})}</tbody></table>{loading&&<p>Đang tải...</p>}{!loading&&!shown.length&&<p className="empty">Không có mã phù hợp</p>}</div></div>
 {selected&&<div className="overlay" onClick={()=>!saving&&setSelected(null)}><div className="panel modal employee-modal" onClick={e=>e.stopPropagation()}><div className="modalhead"><h2>TÌM KHU VỰC · Chi tiết mã sản phẩm</h2><button className="outline" onClick={()=>setSelected(null)}>Đóng</button></div><div className="employee-product"><div><small>Mã sản phẩm</small><h2>{selected.ma_sp}</h2></div><div><small>Tên sản phẩm</small><h3>{product.ten_sp||'Chưa có dữ liệu DSCL'}</h3><small>MNV: {profile.mnv} · {selected.trang_thai}</small></div></div><h3>1. Chênh lệch cũ (theo DSCL)</h3><div className="employee-stats">{[['SL đếm gốc',fmt(product.sl_dem)],['SL trên sổ',fmt(product.sl_so)],['Lượng chênh lệch',fmt(num(product.sl_dem)-num(product.sl_so))],['GT chênh lệch',fmt(product.gt_chenh_lech)],['ĐVT',product.dvt_co_ban||'—']].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div><h3>2. Sau kiểm tra (cập nhật từ khu vực)</h3><div className="employee-stats"><div><small>Tổng +/- SL</small><strong>{fmt(deltaSaved+pendingDelta)}</strong></div><div><small>SL đếm mới</small><strong>{fmt(current)}</strong></div><div><small>Chênh lệch mới</small><strong>{fmt(current-num(product.sl_so))}</strong></div></div><h3>3. Chi tiết khu vực ({lines.length} dòng)</h3><div className="panel" style={{padding:12,marginBottom:10}}><strong>Quét nhanh +/- SL · ĐVT cơ bản: {product.dvt_co_ban||'Chưa có'}</strong><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><select value={scanMode} onChange={e=>setScanMode(e.target.value)}><option value="plus">+ Cộng 1 / lần quét</option><option value="minus">− Trừ 1 / lần quét</option></select><select value={scanRow} onChange={e=>setScanRow(e.target.value)}><option value="">Tự chọn khi Barcode chỉ có một KV</option>{lines.filter(r=>r._source==='CT_KV'&&unit(r.dvt_nhap)===unit(product.dvt_co_ban)).map(r=><option key={r._key} value={r._key}>{r._kv} · {r.barcode}</option>)}</select><input value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')locateBarcode(scanCode)}} placeholder="Quét Barcode / Enter"/><button disabled={scanBusy} onClick={()=>locateBarcode(scanCode)}>Áp dụng lần quét</button><button className="outline" onClick={scanOpen?stopCamera:startCamera}>{scanOpen?'Tắt camera':'Mở camera'}</button></div>{scanOpen&&<video ref={videoRef} autoPlay playsInline muted style={{width:'100%',maxWidth:420,marginTop:8}}/>}{scanNotice&&<p className="inv-hint">{scanNotice}</p>}</div><p className="inv-hint">Nhập +/- theo ĐVT cơ bản: <b>{product.dvt_co_ban||'Chưa có ĐVT cơ bản'}</b>. Số +/- là mức điều chỉnh cuối cùng so với SL gốc của từng dòng, không cộng dồn lịch sử.</p>{detailLoading?<p>Đang tải...</p>:<div className="tablewrap"><table><thead><tr><th>Barcode</th><th>Khu vực</th><th>ĐVT nhập</th><th>SL nhập</th><th>SL quy đổi gốc</th><th>+/- SL (ĐVT cơ bản)</th><th>SL cuối</th></tr></thead><tbody>{lines.map(r=><tr key={r._key} style={scanTarget&&str(r._barcode).split(';').map(x=>x.trim()).includes(scanTarget)?{background:'#e7f6eb'}:{}}><td className="barcode-cell">{r._barcode||'—'}</td><td><input className="kv-input" value={field(r,'kv')} onChange={e=>setEdits(s=>({...s,[r._key]:{...s[r._key],kv:e.target.value}}))}/></td><td>{r.dvt_nhap||'—'}</td><td>{r.sl_nhap??'—'}</td><td>{fmt(r._base)}</td><td><input type="number" step="any" className="qty-input" value={edits[r._key]?.delta??String(num(r._saved)-num(r._base))} onChange={e=>setEdits(s=>({...s,[r._key]:{...s[r._key],delta:e.target.value}}))}/></td><td><strong>{fmt(field(r,'sl'))}</strong></td></tr>)}</tbody></table>{!lines.length&&<p className="empty">Không có chi tiết CT_KV hoặc BC</p>}</div>}<div className="employee-add"><h3>4. Thêm khu vực mới</h3><div className="employee-filter"><label>Khu vực<input value={newKv.khu_vuc} onChange={e=>setNewKv(v=>({...v,khu_vuc:e.target.value}))} placeholder="Ví dụ A3"/></label><label>SL thực tế (quy đổi)<input type="number" min="0" value={newKv.sl} onChange={e=>setNewKv(v=>({...v,sl:e.target.value}))}/></label></div></div>{error&&<div className="warning">{error}</div>}<div className="employee-actions"><button disabled={saving||detailLoading} onClick={()=>save('Đã kiểm')}>{saving?'Đang lưu...':'Cập nhật đã kiểm'}</button></div><p className="inv-hint">Không sửa CT_KV gốc. Cần chính sách RLS cho nhân viên ghi DIEU_CHINH và cập nhật PHAN_CONG; các thao tác nhiều dòng chưa có giao dịch nguyên tử.</p></div></div>}</div>
}

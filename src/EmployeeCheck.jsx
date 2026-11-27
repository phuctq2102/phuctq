import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from './supabase';
const str=v=>String(v??'').trim();
const num=v=>Number(v??0)||0;
const fmt=v=>num(v).toLocaleString('vi-VN');
const checked=v=>str(v)==='Đã kiểm';
const accepted=v=>!['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(str(v).toUpperCase());
const hasBarcode=(v,code)=>str(v).split(';').some(x=>x.trim()===code);
const bars=rows=>[...new Set(rows.flatMap(r=>str(r.barcode).split(';').map(x=>x.trim())).filter(Boolean))].join('; ');
async function read(table,columns,ma_sp){const {data,error}=await supabase.from(table).select(columns).eq('ma_sp',ma_sp).limit(1000);if(error)throw error;return data||[]}
export default function EmployeeCheck({profile,onMessage}){
 const [scanCode,setScanCode]=useState(''),[scanBusy,setScanBusy]=useState(false),[scanOpen,setScanOpen]=useState(false),[scanTarget,setScanTarget]=useState('');const videoRef=useRef(null),streamRef=useRef(null),scanTimer=useRef(null),scanLock=useRef(false),lastScan=useRef({code:'',at:0});
 const [assign,setAssign]=useState([]),[products,setProducts]=useState(new Map()),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[loading,setLoading]=useState(false),[selected,setSelected]=useState(null),[lines,setLines]=useState([]),[changes,setChanges]=useState([]),[edits,setEdits]=useState({}),[newKv,setNewKv]=useState({khu_vuc:'',sl:''}),[detailLoading,setDetailLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 async function reload(){if(!profile?.mnv)return;setLoading(true);setError('');try{
  const {data,error:e}=await supabase.from('phan_cong').select('ma_sp,mnv,trang_thai').eq('mnv',profile.mnv).order('ma_sp').limit(5000);if(e)throw e;
  const list=data||[];setAssign(list);const map=new Map();for(let i=0;i<list.length;i+=150){const ids=list.slice(i,i+150).map(r=>r.ma_sp);if(!ids.length)continue;const {data:ds,error:de}=await supabase.from('dscl').select('ma_sp,ten_sp,sl_dem,sl_so,gt_chenh_lech,dvt_co_ban').in('ma_sp',ids);if(de)throw de;(ds||[]).forEach(r=>map.set(str(r.ma_sp),r))}setProducts(map);
 }catch(e){setError('Không tải được phân công: '+e.message)}finally{setLoading(false)}}
 useEffect(()=>{reload()},[profile?.mnv]);
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
 async function locateBarcode(raw){const code=str(raw);if(!code||scanBusy)return;setScanBusy(true);setError('');try{
  let match=null;for(const table of ['ct_kv','bc']){const {data,error:e}=await supabase.from(table).select('ma_sp,barcode').ilike('barcode','%'+code.replace(/[%_]/g,'')+'%').limit(100);if(e)throw e;match=(data||[]).find(r=>hasBarcode(r.barcode,code)&&assign.some(a=>str(a.ma_sp)===str(r.ma_sp)));if(match)break;}
  if(!match){const found=assign.find(a=>str(a.ma_sp)===code);if(found)match={ma_sp:code};}
  if(!match)throw Error('Không tìm thấy Barcode trong CT_KV/BC của các mã được phân công.');
  const assignment=assign.find(a=>str(a.ma_sp)===str(match.ma_sp));
  stopCamera();
  setScanTarget(code);
  await open(assignment);
 }catch(e){setError('Quét Barcode: '+e.message)}finally{setScanBusy(false)}}

 const shown=useMemo(()=>assign.filter(a=>(filter==='all'||(filter==='done')===checked(a.trang_thai))&&(!search||[a.ma_sp,products.get(str(a.ma_sp))?.ten_sp].some(v=>str(v).toLowerCase().includes(search.toLowerCase())))),[assign,products,filter,search]);
 async function open(a){setSelected(a);setLines([]);setChanges([]);setEdits({});setNewKv({khu_vuc:'',sl:''});setDetailLoading(true);setError('');try{
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
 const field=(row,key)=>edits[row._key]?.[key]??(key==='sl'?row._saved:row._kv);
 const pendingDelta=lines.reduce((total,row)=>{
  const quantity=field(row,'sl');
  if(str(quantity)===''||!Number.isFinite(Number(quantity))||Number(quantity)<0)return total;
  return total+Number(quantity)-num(row._saved);
 },0)
  +(str(newKv.khu_vuc)&&str(newKv.sl)!==''?num(newKv.sl):0);
 const current=num(product.sl_dem)+deltaSaved+pendingDelta;
 async function save(status='Đã kiểm'){
  if(!selected||saving)return;setSaving(true);setError('');try{
   if(lines.some(row=>edits[row._key]?.sl!==undefined&&(
    str(field(row,'sl'))===''||!Number.isFinite(Number(field(row,'sl')))||Number(field(row,'sl'))<0
   )))throw Error('Nhập số lượng thực tế hợp lệ cho từng khu vực. Nhập 0 nếu không còn hàng.');
   const changed=lines.filter(row=>Math.abs(Number(field(row,'sl'))-num(row._saved))>1e-9||str(field(row,'kv'))!==str(row._kv));
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
 return <div className="employee-check"><div className="employee-heading"><h2>Danh sách được phân công</h2><button className="outline" onClick={reload}>↻ Tải lại</button></div><div className="panel employee-filter"><input aria-label="Tìm sản phẩm được phân công" placeholder="Tìm mã SP hoặc tên sản phẩm..." value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Trạng thái kiểm kê" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tất cả</option><option value="pending">Chưa kiểm</option><option value="done">Đã kiểm</option></select><span>{shown.length} mã hàng</span></div>{error&&<div className="warning">{error}</div>}<div className="panel scan-panel"><strong>Tìm mã được giao bằng barcode</strong><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><input aria-label="Barcode hoặc mã sản phẩm" style={{flex:'1 1 200px'}} value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')locateBarcode(scanCode)}} placeholder="Quét hoặc nhập Barcode / mã SP"/><button disabled={scanBusy} onClick={()=>locateBarcode(scanCode)}>{scanBusy?'Đang tìm...':'Tìm mã'}</button><button className="outline" onClick={scanOpen?stopCamera:startCamera}>{scanOpen?'Tắt camera':'Mở camera quét'}</button></div>{scanOpen&&<video ref={videoRef} autoPlay playsInline muted style={{width:'100%',maxWidth:420,marginTop:10,borderRadius:8}}/>}<small>Quét hoặc nhập barcode để mở mã hàng, sau đó nhập số lượng thực tế theo từng khu vực.</small></div><div className="panel"><div className="tablewrap"><table className="employee-list-table"><thead><tr><th>Mã SP</th><th>Tên sản phẩm</th><th>SL đếm gốc</th><th>SL sổ</th><th>GT chênh lệch</th><th>Trạng thái</th><th></th></tr></thead><tbody>{shown.map(a=>{const p=products.get(str(a.ma_sp))||{};return <tr key={a.ma_sp}><td><b>{a.ma_sp}</b></td><td className="inv-name">{p.ten_sp||'Chưa có quyền đọc DSCL'}</td><td data-label="SL đếm gốc">{fmt(p.sl_dem)}</td><td data-label="SL sổ">{fmt(p.sl_so)}</td><td data-label="GT chênh lệch">{fmt(p.gt_chenh_lech)}</td><td><span className={'inv-status '+(checked(a.trang_thai)?'done':'pending')}>{a.trang_thai||'Chưa kiểm'}</span></td><td><button className="small" onClick={()=>{stopCamera();setScanTarget('');open(a)}}>Kiểm tra</button></td></tr>})}</tbody></table>{loading&&<p>Đang tải...</p>}{!loading&&!shown.length&&<p className="empty">Không có mã phù hợp</p>}</div></div>
 {selected&&<div className="overlay" onClick={()=>!saving&&setSelected(null)}><div className="panel modal employee-modal" onClick={e=>e.stopPropagation()}><div className="modalhead"><h2>Chi tiết kiểm kê</h2><button className="outline" onClick={()=>setSelected(null)}>Đóng</button></div><div className="employee-product"><div><small>Mã sản phẩm</small><h2>{selected.ma_sp}</h2></div><div><small>Tên sản phẩm</small><h3>{product.ten_sp||'Chưa có dữ liệu DSCL'}</h3><small>MNV: {profile.mnv} · {selected.trang_thai}</small></div></div><h3>1. Chênh lệch cũ (theo DSCL)</h3><div className="employee-stats">{[['SL đếm gốc',fmt(product.sl_dem)],['SL trên sổ',fmt(product.sl_so)],['Lượng chênh lệch',fmt(num(product.sl_dem)-num(product.sl_so))],['GT chênh lệch',fmt(product.gt_chenh_lech)],['ĐVT',product.dvt_co_ban||'—']].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div><h3>2. Sau kiểm tra (cập nhật từ khu vực)</h3><div className="employee-stats"><div><small>Tổng +/- SL</small><strong>{fmt(deltaSaved+pendingDelta)}</strong></div><div><small>SL đếm mới</small><strong>{fmt(current)}</strong></div><div><small>Chênh lệch mới</small><strong>{fmt(current-num(product.sl_so))}</strong></div></div><h3>3. Chi tiết khu vực ({lines.length} dòng)</h3><p className="inv-hint">Nhập trực tiếp số lượng đã đếm theo ĐVT cơ bản: <b>{product.dvt_co_ban||'Chưa có ĐVT cơ bản'}</b>. Dòng từ BC chỉ xem. Nếu cần bổ sung số lượng cho BC, dùng Thêm khu vực mới.</p>{detailLoading?<p>Đang tải...</p>:<div className="tablewrap"><table className="employee-count-table"><thead><tr><th>Barcode</th><th>Khu vực</th><th>ĐVT nhập</th><th>SL nhập</th><th>SL quy đổi gốc</th><th>SL đã lưu</th><th>SL thực tế</th></tr></thead><tbody>{lines.map(r=><tr key={r._key} style={scanTarget&&str(r._barcode).split(';').map(x=>x.trim()).includes(scanTarget)?{background:'var(--success-bg)'}:{}}><td className="barcode-cell">{r._barcode||'—'}</td><td data-label="Khu vực"><input aria-label={'Khu vực '+r._kv} className="kv-input" disabled={saving||r._source==='BC'} value={field(r,'kv')} onChange={e=>setEdits(s=>({...s,[r._key]:{...s[r._key],kv:e.target.value}}))}/></td><td data-label="ĐVT nhập">{r.dvt_nhap||'—'}</td><td data-label="SL nhập">{r.sl_nhap??'—'}</td><td data-label="SL quy đổi gốc">{fmt(r._base)}</td><td data-label="SL đã lưu">{fmt(r._saved)}</td><td data-label="SL thực tế"><input aria-label={'Số lượng thực tế tại '+r._kv} type="number" min="0" step="any" inputMode="decimal" className="qty-input" disabled={saving||r._source==='BC'} value={field(r,'sl')} onChange={e=>setEdits(values=>({...values,[r._key]:{...values[r._key],sl:e.target.value}}))}/></td></tr>)}</tbody></table>{!lines.length&&<p className="empty">Không có chi tiết CT_KV hoặc BC</p>}</div>}<div className="employee-add"><h3>4. Thêm khu vực mới</h3><div className="employee-filter"><label>Khu vực<input value={newKv.khu_vuc} onChange={e=>setNewKv(v=>({...v,khu_vuc:e.target.value}))} placeholder="Ví dụ A3"/></label><label>SL thực tế (quy đổi)<input type="number" min="0" value={newKv.sl} onChange={e=>setNewKv(v=>({...v,sl:e.target.value}))}/></label></div></div>{error&&<div className="warning">{error}</div>}<div className="employee-actions"><button disabled={saving||detailLoading} onClick={()=>save('Đã kiểm')}>{saving?'Đang lưu...':'Cập nhật đã kiểm'}</button></div><p className="inv-hint">Không sửa CT_KV gốc. Cần chính sách RLS cho nhân viên ghi DIEU_CHINH và cập nhật PHAN_CONG; các thao tác nhiều dòng chưa có giao dịch nguyên tử.</p></div></div>}</div>
}

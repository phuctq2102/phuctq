import React,{useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {supabase,fetchAll} from './supabase';
const key=v=>String(v??'').trim();
const number=v=>Number(v??0)||0;
const fmt=v=>number(v).toLocaleString('vi-VN',{maximumFractionDigits:3});
const valid=c=>!['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(key(c.trang_thai_duyet).toUpperCase());
const isNew=c=>key(c.loai_dieu_chinh).toUpperCase()==='THEM_KV';
const stamp=c=>String(c.updated_at||c.created_at||'');
const norm=v=>key(v).normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ');
const barcodeParts=v=>key(v).split(';').map(x=>x.trim()).filter(Boolean);
export function pickQrBarcode(code,dvt,ct,bc){
 const matches=(rows,field)=>rows.filter(r=>key(r.ma_sp)===code&&norm(r[field])===norm(dvt)).flatMap(r=>barcodeParts(r.barcode));
 return [...new Set(matches(ct,'dvt_nhap'))][0]||[...new Set(matches(bc,'dvt_co_ban'))][0]||code;
}
const signature=r=>[r.ma_sp,r.delta,r.sl_moi,r.chenh_moi,r.change_revision].join('|');
// Each original CT_KV row has only ONE effective latest correction. Added areas are
// counted once per unique correction id, including after subsequent edits.
export function summarizeFinal(assignments,products,corrections,ctRows){
 const byProduct=new Map();
 for(const c of corrections.filter(valid)){
  const code=key(c.ma_sp);if(!code)continue;
  if(!byProduct.has(code))byProduct.set(code,[]);
  byProduct.get(code).push(c);
 }
 const original=new Map(ctRows.map(r=>[key(r.id),number(r.sl_dem)]));
 const output=new Map();
 for(const a of assignments){
  const code=key(a.ma_sp);if(!code)continue;
  const p=products.get(code)||{};
  const changes=(byProduct.get(code)||[]).slice().sort((a,b)=>stamp(a).localeCompare(stamp(b))||key(a.id).localeCompare(key(b.id)));
  const latest=new Map(),additions=new Map(),first=new Map();
  for(const c of changes){
   if(isNew(c)){const identity=key(c.ma_dong_moi)||('kv:'+norm(c.khu_vuc_moi));additions.set(identity,c);continue;}
   const id=key(c.ct_kv_id);
   if(id){if(!first.has(id))first.set(id,c);latest.set(id,c);}
   else if(c.id!=null)latest.set('unlinked:'+key(c.id),c);
  }
  let delta=0;
  for(const [id,c] of latest){
   const base=original.has(id)?original.get(id):number(first.get(id)?.sl_cu??c.sl_cu);
   delta+=number(c.sl_moi)-base;
  }
  for(const c of additions.values())delta+=number(c.sl_moi);
  const oldCount=number(p.sl_dem),book=number(p.sl_so),oldDiff=oldCount-book;
  const newCount=oldCount+delta,newDiff=newCount-book;
  // The unit value is derived from the original DSCL difference when possible.
  // A zero original difference cannot establish a reliable unit price.
  const oldValue=number(p.gt_chenh_lech);
  const unit=oldDiff!==0?oldValue/oldDiff:null;
  if(Math.abs(delta)<1e-9)continue;
  output.set(code,{ma_sp:code,ten_sp:p.ten_sp||'',mnv:key(a.mnv),sl_goc:oldCount,sl_so:book,chenh_cu:oldDiff,gt_cu:oldValue,delta,sl_moi:newCount,chenh_moi:newDiff,gt_moi:unit===null?null:newDiff*unit,trang_thai:a.trang_thai==='Đã kiểm'?'Đã kiểm':'Chưa kiểm',dvt:p.dvt_co_ban||'',so_lan:changes.length,change_revision:changes.map(c=>[c.id,c.sl_moi,c.khu_vuc_moi,c.updated_at||c.created_at].join(':')).join(';')});
 }
 return [...output.values()].sort((a,b)=>a.ma_sp.localeCompare(b.ma_sp,'vi'));
}

// Detail view shares the same latest-value rules as the Final summary.
export function buildDetails(ctRows,corrections){
 const byCode=new Map(),latest=new Map(),newAreas=new Map();
 for(const r of ctRows){const code=key(r.ma_sp);if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(r);}
 const ordered=corrections.filter(valid).slice().sort((a,b)=>stamp(a).localeCompare(stamp(b))||number(a.id)-number(b.id));
 for(const c of ordered){const code=key(c.ma_sp);if(isNew(c)){if(!newAreas.has(code))newAreas.set(code,new Map());newAreas.get(code).set(key(c.ma_dong_moi)||('kv:'+norm(c.khu_vuc_moi)),c);}else if(key(c.ct_kv_id)){latest.set(code+':'+key(c.ct_kv_id),c);}}
 const result=new Map();
 for(const code of new Set([...byCode.keys(),...newAreas.keys()])){
  const lines=(byCode.get(code)||[]).map(r=>{const c=latest.get(code+':'+key(r.id));const base=number(r.sl_dem),actual=c?number(c.sl_moi):base;return {identity:'ct:'+r.id,source:'CT_KV',barcode:r.barcode,kv:c?.khu_vuc_moi||r.khu_vuc,dvt:r.dvt_nhap,sl_nhap:r.sl_nhap,base,actual,delta:actual-base};});
  for(const [id,c] of (newAreas.get(code)||new Map()))lines.push({identity:'new:'+id,source:'KV mới',barcode:'',kv:c.khu_vuc_moi,dvt:'',sl_nhap:null,base:0,actual:number(c.sl_moi),delta:number(c.sl_moi)});
  result.set(code,lines);
 }
 return result;
}

export default function FinalView(){
 const [exportBusy,setExportBusy]=useState(false);
 const [detailLines,setDetailLines]=useState([]),[detailBusy,setDetailBusy]=useState(false),[detailEdits,setDetailEdits]=useState({}),[detailNewKv,setDetailNewKv]=useState({khu_vuc:'',sl_thuc_te:''}),[detailSaving,setDetailSaving]=useState(false);
 const [detailData,setDetailData]=useState(new Map()),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(0),[selected,setSelected]=useState(null),[approvals,setApprovals]=useState(new Map());
 // Query only products with corrections. Fetching the entire DSCL/CT_KV/BC
 // was forcing Final to wait for thousands of unrelated rows.
 async function queryRows(table, codes, columns='*'){
  const out=[];
  for(let i=0;i<codes.length;i+=80){
   const ids=codes.slice(i,i+80);
   const {data,error}=await supabase.from(table).select(columns).in('ma_sp',ids).limit(10000);
   if(error)throw new Error(table+': '+error.message);
   out.push(...(data||[]));
  }
  return out;
 }
 async function loadFinal(){
  // The synchronized table is authoritative. Do not depend on assignment,
  // barcode, or adjustment history just to display a Final product.
  const source=await fetchAll('final_lines',[],500);
  const result=source.filter(x=>{
   const delta=x.du_lieu_goc?.delta;
   return delta===undefined||delta===null?Math.abs(number(x.chenh_lech))>1e-9:Math.abs(number(delta))>1e-9;
  }).map(x=>{
   const oldCount=number(x.du_lieu_goc?.sl_dem_goc??x.sl_dem);
   const newCount=number(x.sl_dem),book=number(x.sl_so);
   const oldDiff=oldCount-book,newDiff=newCount-book;
   const newValue=x.gt_chenh_lech==null?null:number(x.gt_chenh_lech);
   return {ma_sp:key(x.ma_sp),ten_sp:x.ten_sp||'',mnv:key(x.mnv),
    sl_goc:oldCount,sl_so:book,chenh_cu:oldDiff,
    gt_cu:newValue!==null&&newDiff!==0?newValue*oldDiff/newDiff:null,
    delta:number(x.du_lieu_goc?.delta??newCount-oldCount),sl_moi:newCount,
    chenh_moi:newDiff,gt_moi:newValue,trang_thai:x.trang_thai||'Chưa kiểm',
    dvt:x.dvt_co_ban||'',so_lan:1,
    change_revision:key(x.updated_at||x.created_at||''),
    qr_value:key(x.qr_content||x.barcode||x.ma_sp)};
  });
  let checks=[];
  if(result.length){try{
   const {data,error}=await supabase.from('admin_final_check').select('*').in('ma_sp',result.map(r=>r.ma_sp));
   if(!error)checks=data||[];
  }catch(_){}}
  return {rows:result,details:new Map(),checks:new Map(checks.map(x=>[key(x.ma_sp),x]))};
 }
 async function reload(){
  setBusy(true);setError('');
  try{const result=await loadFinal();setDetailData(result.details);setApprovals(result.checks);setRows(result.rows);setPage(0)}
  catch(e){setError('Không tải được Final: '+(e?.message||String(e)))}
  finally{setBusy(false)}
 }
 useEffect(()=>{reload();const refresh=()=>{if(document.visibilityState==='visible')reload()};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  const channel=supabase.channel('v10-final-live').on('postgres_changes',{event:'*',schema:'public',table:'final_lines'},refresh).subscribe();
  return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);supabase.removeChannel(channel)};
 },[]);
 async function openDetail(r){
  setSelected(r);setDetailLines([]);setDetailEdits({});setDetailNewKv({khu_vuc:'',sl_thuc_te:''});setDetailBusy(true);setError('');
  try {
   const [ct,bc,changes]=await Promise.all([
    supabase.from('ct_kv').select('id,ma_sp,barcode,khu_vuc,dvt_nhap,sl_nhap,sl_dem').eq('ma_sp',r.ma_sp).limit(1000),
    supabase.from('bc').select('id,ma_sp,barcode,khu_vuc,dvt_co_ban,sl_dem').eq('ma_sp',r.ma_sp).limit(1000),
    supabase.from('dieu_chinh').select('id,ma_sp,ct_kv_id,loai_dieu_chinh,khu_vuc_moi,sl_moi,sl_chenh_lech,trang_thai_duyet,created_at,ghi_chu').eq('ma_sp',r.ma_sp).order('created_at',{ascending:true}).limit(1000)
   ]);
   if(ct.error)throw ct.error;if(bc.error)throw bc.error;if(changes.error)throw changes.error;
   const ctRows=ct.data||[],bcRows=bc.data||[],corrections=(changes.data||[]).filter(valid);
   const latest=new Map();
   for(const c of corrections)if(c.ct_kv_id!=null)latest.set(key(c.ct_kv_id),c);
   const useBC=(number(r.sl_goc)===0&&bcRows.length>0)||(!ctRows.length&&bcRows.length>0);
   const source=useBC?bcRows:ctRows;
   const regular=source.map((d,i)=>{
    const c=latest.get(key(d.id));
    return {identity:(useBC?'bc:':'ct:')+key(d.id??i),id:d.id,source:useBC?'BC':'CT_KV',barcode:d.barcode||'',kv:c?.khu_vuc_moi||d.khu_vuc||'',dvt:d.dvt_nhap||d.dvt_co_ban||'',sl_nhap:d.sl_nhap,actual:useBC?number(d.sl_dem):number(c?.sl_moi??d.sl_dem)};
   });
   const added=corrections.filter(isNew).map(c=>({identity:'new:'+c.id,id:c.id,source:'KV_MOI',barcode:'',kv:c.khu_vuc_moi||'',dvt:'',sl_nhap:null,actual:number(c.sl_moi)}));
   setDetailLines([...regular,...added]);
  }catch(e){setError('Không tải được chi tiết KV: '+e.message)}
  finally{setDetailBusy(false)}
 }
 const detailActual=d=>detailEdits[d.identity]?.sl!==undefined?Number(detailEdits[d.identity].sl):d.actual;
 const detailKv=d=>detailEdits[d.identity]?.kv??d.kv;
 function updateDetail(d,field,value){setDetailEdits(old=>({...old,[d.identity]:{...(old[d.identity]||{}),[field]:value}}))}
 async function saveDetail(){
  if(!selected||detailSaving)return;
  const changed=detailLines.filter(d=>detailActual(d)!==d.actual||detailKv(d)!==d.kv);
  const newArea=key(detailNewKv.khu_vuc),raw=key(detailNewKv.sl_thuc_te);
  if(!changed.length&&!newArea&&!raw)return;
  if(changed.some(d=>!Number.isFinite(detailActual(d))||detailActual(d)<0)||((newArea||raw)&&(!newArea||raw===''||!Number.isFinite(Number(raw))||Number(raw)<0))){setError('Vui lòng nhập SL hợp lệ và đầy đủ Khu vực + SL khi thêm KV.');return}
  if(changed.some(d=>d.source==='BC')){setError('Dòng BC không có CT_KV ID để sửa. Hãy dùng Thêm khu vực mới.');return}
  setDetailSaving(true);setError('');
  try{
   const {data:auth}=await supabase.auth.getUser();
   const who=auth?.user?.email||'ADMIN';
   for(const d of changed){
    const sl=detailActual(d),kv=detailKv(d);
    if(d.source==='KV_MOI'){
     // Existing schema treats a newly-added KV as one correction record.
     const {error:e}=await supabase.from('dieu_chinh').update({sl_moi:sl,sl_chenh_lech:sl,khu_vuc_moi:kv}).eq('id',d.id);
     if(e)throw e;
    }else{
     const {error:e}=await supabase.from('dieu_chinh').insert({
      ma_sp:selected.ma_sp,ct_kv_id:d.id,loai_dieu_chinh:kv!==d.kv?'SUA_KV':'SUA_SO_LUONG',
      khu_vuc_cu:d.kv||null,khu_vuc_moi:kv||null,sl_cu:d.actual,sl_moi:sl,sl_chenh_lech:sl-d.actual,
      mnv:selected.mnv||null,nguoi_cap_nhat:who,ghi_chu:'Admin cập nhật KV từ Final',trang_thai_duyet:'Không cần duyệt'
     });
     if(e)throw e;
    }
   }
   if(newArea){
    const sl=Number(raw);
    const {error:e}=await supabase.from('dieu_chinh').insert({
     ma_sp:selected.ma_sp,ct_kv_id:null,loai_dieu_chinh:'THEM_KV',
     khu_vuc_cu:null,khu_vuc_moi:newArea,sl_cu:0,sl_moi:sl,sl_chenh_lech:sl,
     mnv:selected.mnv||null,nguoi_cap_nhat:who,ghi_chu:'Admin thêm KV từ Final',trang_thai_duyet:'Không cần duyệt'
    });
    if(e)throw e;
   }
   // Refresh the derived Final table, then verify its persisted result.
   const {error:refreshError}=await supabase.rpc('v10_admin_refresh_final',{p_ma_sp:selected.ma_sp});
   if(refreshError)throw Error('Đã ghi điều chỉnh nhưng làm mới Final thất bại: '+refreshError.message);
   const {error:checkError}=await supabase.from('final_lines').select('ma_sp').eq('ma_sp',selected.ma_sp).limit(1);
   if(checkError)throw checkError;
   setSelected(null);await reload();
  }catch(e){setError('Không cập nhật được Final: '+e.message)}
  finally{setDetailSaving(false)}
 }
 const adminStatus=r=>approvals.get(r.ma_sp)?.revision===signature(r)?'Đã kiểm':'Chưa kiểm';
 async function confirmAdmin(r){
  setBusy(true);setError('');try{
   const {error}=await supabase.from('admin_final_check').upsert({ma_sp:r.ma_sp,revision:signature(r),confirmed_at:new Date().toISOString(),confirmed_by:(await supabase.auth.getUser()).data.user.id},{onConflict:'ma_sp'});
   if(error)throw error;
   setApprovals(old=>new Map(old).set(r.ma_sp,{ma_sp:r.ma_sp,revision:signature(r)}));
  }catch(e){setError('Không xác nhận được Admin: '+e.message)}finally{setBusy(false)}
 }
 const qrUrl=r=>'https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=5&data='+encodeURIComponent(r.qr_value);
 // ExcelJS supports embedded pictures, unlike the existing SheetJS export.
 // Load it only when exporting to avoid slowing down the Final screen.
 async function loadExcelJS(){
  if(window.ExcelJS)return window.ExcelJS;
  const url='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  await new Promise((resolve,reject)=>{
   const existing=document.querySelector('script[data-v10-exceljs]');
   if(existing){if(window.ExcelJS)return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('Không tải được thư viện ExcelJS')),{once:true});return;}
   const script=document.createElement('script');script.src=url;script.dataset.v10Exceljs='1';script.onload=resolve;script.onerror=()=>reject(new Error('Không tải được ExcelJS từ CDN'));document.head.appendChild(script);
  });
  if(!window.ExcelJS)throw new Error('Thư viện ExcelJS chưa sẵn sàng');
  return window.ExcelJS;
 }
 const exportFields=[['Mã SP','ma_sp'],['Tên sản phẩm','ten_sp'],['MNV','mnv'],['ĐVT cơ bản','dvt'],['SL đếm gốc','sl_goc'],['SL trên sổ','sl_so'],['Chênh lệch cũ','chenh_cu'],['GT chênh lệch cũ','gt_cu'],['+/- SL quy đổi','delta'],['SL đếm mới','sl_moi'],['Chênh lệch mới','chenh_moi'],['GT chênh lệch mới (ước tính)','gt_moi'],['Trạng thái Admin','admin_status'],['Barcode / QR','qr_value']];
 function exportFallback(data){
  const records=data.map(r=>Object.fromEntries([...exportFields.map(([label,field])=>[label,field==='admin_status'?adminStatus(r):r[field]??'']),['Link ảnh QR',qrUrl(r)]]));
  const sheet=XLSX.utils.json_to_sheet(records);sheet['!cols']=exportFields.map(([label])=>({wch:label==='Tên sản phẩm'?45:20})).concat([{wch:65}]);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'FINAL');
  XLSX.writeFile(book,'V10_FINAL_'+new Date().toISOString().slice(0,10)+'.xlsx');
 }
 async function exportFinal(){
  if(busy||exportBusy)return;
  if(!filtered.length){setError('Không có dòng Final phù hợp để xuất.');return;}
  setExportBusy(true);setError('');
  try{
   const ExcelJS=await loadExcelJS();
   const book=new ExcelJS.Workbook();book.creator='V10';book.created=new Date();
   const sheet=book.addWorksheet('FINAL',{views:[{state:'frozen',ySplit:1}]});
   sheet.columns=[...exportFields.map(([header,key])=>({header,key,width:header==='Tên sản phẩm'?43:header==='Barcode / QR'?22:19})),{header:'QR Code (ảnh)',key:'qr_image',width:22}];
   sheet.getRow(1).height=30;sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
   sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17365D'}};
   sheet.autoFilter={from:'A1',to:'O1'};
   const numeric=new Set(['sl_goc','sl_so','chenh_cu','gt_cu','delta','sl_moi','chenh_moi','gt_moi']);
   for(let i=0;i<filtered.length;i++){
    const r=filtered[i];const values={...r,admin_status:adminStatus(r),ma_sp:String(r.ma_sp),qr_value:String(r.qr_value||r.ma_sp)};
    const row=sheet.addRow(values);row.height=85;row.alignment={vertical:'middle',wrapText:true};
    for(const [col,field] of exportFields.entries()){
     const cell=row.getCell(col+1);if(numeric.has(field)){cell.value=r[field]===null?null:Number(r[field]);cell.numFmt='#,##0.###;[Red](#,##0.###)';}
    }
    const response=await fetch(qrUrl(r));
    if(!response.ok)throw new Error('Không tải được ảnh QR cho mã '+r.ma_sp+' (HTTP '+response.status+')');
    const blob=await response.blob();
    if(!blob.type.startsWith('image/'))throw new Error('Dịch vụ QR không trả về ảnh cho '+r.ma_sp);
    const buffer=await blob.arrayBuffer();
    const imageId=book.addImage({buffer,extension:'png'});
    sheet.addImage(imageId,{tl:{col:14.15,row:i+1.12},ext:{width:105,height:105}});
    row.getCell(15).value=null;
   }
   const bytes=await book.xlsx.writeBuffer();
   const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const link=document.createElement('a');const objectUrl=URL.createObjectURL(blob);link.href=objectUrl;link.download='V10_FINAL_QR_'+new Date().toISOString().slice(0,10)+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  }catch(e){
   // Never pretend the fallback contains embedded QR images.
   exportFallback(filtered);
   setError('Không chèn được ảnh QR: '+(e?.message||String(e))+'. Đã xuất Excel dự phòng gồm dữ liệu và link ảnh QR (chưa có ảnh nhúng). Kiểm tra Internet rồi thử lại để xuất QR dạng ảnh.');
  }finally{setExportBusy(false);}
 }


 const filtered=useMemo(()=>rows.filter(r=>(status==='all'||adminStatus(r)===status)&&(!search||[r.ma_sp,r.ten_sp,r.mnv].some(v=>key(v).toLowerCase().includes(search.toLowerCase())))),[rows,status,search]);
 const done=rows.filter(r=>adminStatus(r)==='Đã kiểm').length,modified=rows.length;
 return <div className="final-page">
  <div className="inv-title"><div><h2>FINAL / QR Code</h2><p>Tự động tổng hợp kết quả mới nhất · Mỗi mã sản phẩm một dòng</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="outline" onClick={reload} disabled={busy||exportBusy}>↻ Tải Final mới nhất</button><button onClick={exportFinal} disabled={busy||exportBusy||!filtered.length}>{exportBusy?"Đang tạo Excel + QR...":"⬇ Xuất Excel + QR"}</button></div></div>
  <div className="inv-kpis"><div><small>Tổng mã</small><strong>{rows.length}</strong></div><div><small>Có điều chỉnh</small><strong>{modified}</strong></div><div><small>Đã kiểm</small><strong className="green">{done}</strong></div><div><small>Chưa kiểm</small><strong className="orange">{rows.length-done}</strong></div></div>
  <div className="panel"><div className="employee-filter"><input placeholder="Tìm mã SP, tên sản phẩm, MNV..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="all">Tất cả trạng thái</option><option value="Đã kiểm">Đã kiểm</option><option value="Chưa kiểm">Chưa kiểm</option></select><span>{filtered.length} mã</span></div>
  {error&&<div className="warning">{error}</div>}{busy&&<p>Đang tổng hợp Final...</p>}
  <div className="tablewrap final-table" style={{maxWidth:"100%",overflowX:"auto"}}><table style={{whiteSpace:"normal",width:"100%",tableLayout:"auto",fontSize:12}}><thead><tr><th>Mã SP</th><th>Tên sản phẩm</th><th>MNV</th><th>SL đếm gốc</th><th>SL trên sổ</th><th>Chênh lệch cũ</th><th>GT lệch cũ</th><th>+/- QĐ</th><th>SL đếm mới</th><th>Chênh lệch mới</th><th>GT lệch mới*</th><th>Trạng thái Admin</th><th>QR</th><th>Xác nhận Admin</th><th>Chi tiết</th></tr></thead><tbody>{filtered.slice(page*100,(page+1)*100).map(r=><tr key={r.ma_sp}><td style={{whiteSpace:"nowrap",textAlign:"center"}}><b>{r.ma_sp}</b></td><td className="inv-name" style={{minWidth:140,maxWidth:220,whiteSpace:"normal",overflowWrap:"anywhere",verticalAlign:"middle"}}>{r.ten_sp}</td><td>{r.mnv}</td><td>{fmt(r.sl_goc)}</td><td>{fmt(r.sl_so)}</td><td>{fmt(r.chenh_cu)}</td><td>{fmt(r.gt_cu)}</td><td className={r.delta<0?'negative':r.delta>0?'positive':''}>{fmt(r.delta)}</td><td style={{textAlign:"right",fontWeight:600}}>{fmt(r.sl_moi)}</td><td className={r.chenh_moi<0?'negative':'positive'}>{fmt(r.chenh_moi)}</td><td>{r.gt_moi===null?'—':fmt(r.gt_moi)}</td><td><span className={'inv-status '+(adminStatus(r)==='Đã kiểm'?'done':'pending')}>{adminStatus(r)}</span></td><td><img src={qrUrl(r)} alt={'QR '+r.qr_value} width="54" height="54" loading="lazy"/><div style={{fontSize:10,overflowWrap:'anywhere',maxWidth:130}}>{r.qr_value}</div></td><td><button className="small" disabled={busy||adminStatus(r)==='Đã kiểm'} onClick={()=>confirmAdmin(r)}>Xác nhận đã kiểm</button></td><td><button className="small" onClick={()=>openDetail(r)}>Xem</button></td></tr>)}</tbody></table>{!busy&&!filtered.length&&<p className="empty">Không có mã phù hợp</p>}</div>
  <div className="pager"><button className="outline" disabled={page===0} onClick={()=>setPage(v=>v-1)}>Trước</button><span>Trang {page+1}/{Math.max(1,Math.ceil(filtered.length/100))}</span><button className="outline" disabled={(page+1)*100>=filtered.length} onClick={()=>setPage(v=>v+1)}>Sau</button></div>
  <p className="inv-hint">* GT lệch mới là ước tính theo đơn giá suy ra từ DSCL; nếu chênh lệch cũ bằng 0 thì để trống. Final chỉ hiển thị mã có thay đổi SL ròng khác 0; trạng thái xác nhận riêng của Admin. QR sử dụng dịch vụ ảnh bên ngoài, cần kết nối Internet. Nút xuất Excel + QR tải toàn bộ các mã theo bộ lọc hiện tại, không chỉ trang đang xem. File QR nhúng cần ExcelJS từ CDN và ảnh QR tải được qua Internet.</p></div>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="panel modal" onClick={e=>e.stopPropagation()}><div className="modalhead"><h2>Final · {selected.ma_sp}</h2><button className="outline" onClick={()=>setSelected(null)}>Đóng</button></div><h3>{selected.ten_sp}</h3><div className="fields">{[['MNV',selected.mnv],['SL đếm gốc',fmt(selected.sl_goc)],['SL trên sổ',fmt(selected.sl_so)],['Chênh lệch cũ',fmt(selected.chenh_cu)],['Tổng +/- QĐ',fmt(selected.delta)],['SL đếm mới',fmt(selected.sl_moi)],['Chênh lệch mới',fmt(selected.chenh_moi)],['GT chênh lệch mới',selected.gt_moi===null?'Chưa xác định':fmt(selected.gt_moi)],['Trạng thái Admin',adminStatus(selected)],['QR / Barcode',selected.qr_value],['Số bản ghi điều chỉnh',selected.so_lan]].map(([k,v])=><div key={k}><b>{k}</b><span>{v}</span></div>)}</div><h3>Chi tiết khu vực ({detailLines.length} dòng)</h3>
 {detailBusy?<p>Đang tải chi tiết...</p>:<div className="tablewrap"><table><thead><tr><th>Nguồn</th><th>Barcode</th><th>Khu vực</th><th>ĐVT nhập</th><th>SL nhập</th><th>SL hiện tại</th><th>Điều chỉnh</th></tr></thead><tbody>{detailLines.map(d=><tr key={d.identity}><td>{d.source}</td><td style={{overflowWrap:'anywhere'}}>{d.barcode||'—'}</td><td><input style={{minWidth:110,maxWidth:180}} value={detailKv(d)} onChange={e=>updateDetail(d,'kv',e.target.value)} /></td><td>{d.dvt||'—'}</td><td>{d.sl_nhap??'—'}</td><td>{fmt(d.actual)}</td><td><div style={{display:'flex',alignItems:'center',gap:5}}><button className="small outline" onClick={()=>updateDetail(d,'sl',String(Math.max(0,detailActual(d)-1)))}>−</button><input aria-label={'SL '+d.kv} type="number" min="0" step="any" style={{width:90}} value={detailEdits[d.identity]?.sl??String(d.actual)} onChange={e=>updateDetail(d,'sl',e.target.value)}/><button className="small outline" onClick={()=>updateDetail(d,'sl',String(detailActual(d)+1))}>+</button></div></td></tr>)}</tbody></table>{!detailLines.length&&<p className="empty">Chưa có chi tiết khu vực.</p>}</div>}
 <div className="panel" style={{padding:12,marginTop:12}}><h3>Thêm khu vực mới</h3><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>Khu vực<input placeholder="Ví dụ A3" value={detailNewKv.khu_vuc} onChange={e=>setDetailNewKv(v=>({...v,khu_vuc:e.target.value}))}/></label><label>SL thực tế (quy đổi)<input type="number" min="0" step="any" value={detailNewKv.sl_thuc_te} onChange={e=>setDetailNewKv(v=>({...v,sl_thuc_te:e.target.value}))}/></label></div></div>
 <button disabled={detailBusy||detailSaving} onClick={saveDetail}>{detailSaving?'Đang cập nhật...':'Cập nhật đã kiểm'}</button></div></div>}
 </div>;
}

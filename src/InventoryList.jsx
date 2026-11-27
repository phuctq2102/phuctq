import React,{useEffect,useMemo,useState} from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { InventoryTable } from './components/InventoryTable';
import { Button } from './components/ui/button';
import {supabase} from './supabase';
const PAGE_SIZE=50;
const fmt=v=>Number(v||0).toLocaleString('vi-VN');
const txt=v=>String(v??'').trim();
const status=v=>/^(da kiem|đã kiểm)$/i.test(txt(v))?'Đã kiểm':'Chưa kiểm';
const baseCount=r=>Number(r.sl_dem??r.sl_duoc_dem??0);
const currentCount=r=>Number(r._currentCount??baseCount(r));
const norm=v=>txt(v).normalize('NFC').toLocaleUpperCase('vi-VN').replace(/\s+/g,' ');
const barcodeParts=v=>txt(v).split(';').map(txt).filter(Boolean);
const amount=r=>{const raw=Number(r.gt_chenh_lech||0);const diff=currentCount(r)-Number(r.sl_so??0);return diff<0?-Math.abs(raw):diff>0?Math.abs(raw):raw};
const formatDifference=value=><span className={value<0?'negative':value>0?'positive':undefined}>{fmt(value)}</span>;
export default function InventoryList({admin,profile,onMessage}){
 const [items,setItems]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[search,setSearch]=useState(''),[threshold,setThreshold]=useState('0'),[state,setState]=useState('all'),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[details,setDetails]=useState([]),[detailBusy,setDetailBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[edits,setEdits]=useState({}),[saving,setSaving]=useState(false),[newKv,setNewKv]=useState({khu_vuc:'',sl_thuc_te:''}),[materialGroup,setMaterialGroup]=useState(''),[groupOptions,setGroupOptions]=useState([]),[kv,setKv]=useState(''),[kvOptions,setKvOptions]=useState([]),[barcodeRows,setBarcodeRows]=useState([]),[barcodeError,setBarcodeError]=useState('');
 // Load material groups across the complete DSCL table, not just the current 50 rows.
 useEffect(()=>{let active=true;(async()=>{try{const values=new Set();for(let offset=0;offset<100000;offset+=1000){const {data,error}=await supabase.from('dscl').select('nhom_vat_tu').order('nhom_vat_tu',{ascending:true}).range(offset,offset+999);if(error)throw error;for(const row of data||[]){const name=txt(row.nhom_vat_tu);if(name)values.add(name)}if((data||[]).length<1000)break;}if(active)setGroupOptions([...values].sort((a,b)=>a.localeCompare(b,'vi')))}catch(e){if(active)setError('Không tải được Nhóm vật tư: '+e.message)}})();return()=>{active=false}},[refresh]);
 // Read source rows in pages. Barcode and KV are display/search metadata only; source tables remain unchanged.
 useEffect(()=>{let active=true;async function readAll(table,columns){const out=[];for(let start=0;start<100000;start+=1000){const {data,error}=await supabase.from(table).select(columns).range(start,start+999);if(error)throw error;out.push(...(data||[]));if((data||[]).length<1000)break;}return out}
 (async()=>{try{const [ct,bc]=await Promise.all([readAll('ct_kv','ma_sp,barcode,khu_vuc,dvt_nhap'),readAll('bc','ma_sp,barcode,khu_vuc,dvt_co_ban')]);if(!active)return;setBarcodeRows([...ct.map(x=>({...x,_source:'CT_KV'})),...bc.map(x=>({...x,_source:'BC'}))]);setKvOptions([...new Set([...ct,...bc].map(x=>txt(x.khu_vuc)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')));setBarcodeError('')}catch(e){if(active){setBarcodeRows([]);setBarcodeError('Không tải được Barcode/KV: '+e.message)}}})();return()=>{active=false}},[refresh]);
 const sourceByProduct=useMemo(()=>{const map=new Map();for(const r of barcodeRows){const k=txt(r.ma_sp);if(!k)continue;if(!map.has(k))map.set(k,[]);map.get(k).push(r)}return map},[barcodeRows]);
 const barcodesFor=r=>[...new Set((sourceByProduct.get(txt(r.ma_sp))||[]).filter(x=>norm(x._source==='BC'?x.dvt_co_ban:x.dvt_nhap)===norm(r.dvt_co_ban)&&norm(r.dvt_co_ban)).flatMap(x=>barcodeParts(x.barcode)))].join('; ');
 // Query server-side for DSCL; no writes to source tables.
 useEffect(()=>{let alive=true;async function run(){setBusy(true);setError('');try{
  let q=supabase.from('dscl').select('*',{count:'exact'});
  const term=search.trim().replace(/[,()]/g,' ');
  if(term||kv){const matches=new Set();for(const [id,rows] of sourceByProduct){if(rows.some(r=>(!kv||txt(r.khu_vuc)===kv)&&(!term||barcodeParts(r.barcode).some(b=>b.toLowerCase().includes(term.toLowerCase())))))matches.add(id)}
   // Barcode matches are checked again against DSCL base unit after the DSCL rows are loaded.
   if(kv){if(matches.size>500)throw Error('Khu vực có hơn 500 mã. Hãy thu hẹp bằng tìm kiếm hoặc nhóm vật tư.');if(!matches.size){setItems([]);setTotal(0);setBusy(false);return}q=q.in('ma_sp',[...matches])}
   if(term){const matchingBarcodes=[...sourceByProduct].filter(([id,rows])=>rows.some(r=>(!kv||txt(r.khu_vuc)===kv)&&barcodeParts(r.barcode).some(b=>b.toLowerCase().includes(term.toLowerCase())))).map(([id])=>id);
    if(matchingBarcodes.length>500)throw Error('Quá 500 mã trùng Barcode; hãy nhập Barcode cụ thể hơn.');
    const safe=term.replace(/[%,.*]/g,' ').trim();
    if(safe){const or=[`ma_sp.ilike.%${safe}%`,`ten_sp.ilike.%${safe}%`,...matchingBarcodes.length?[`ma_sp.in.(${matchingBarcodes.map(v=>'\"'+v.replaceAll('\"','')+'\"').join(',')})`]:[]];q=q.or(or.join(','))}
   }}
  if(materialGroup)q=q.eq('nhom_vat_tu',materialGroup);
  const n=Number(threshold)||0;
  if(n>0){q=q.or(`gt_chenh_lech.gte.${n},gt_chenh_lech.lte.${-n}`)}
  q=q.order('ma_sp',{ascending:true}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
  const {data,count,error:e}=await q;if(e)throw e;
  const base=data||[];const ids=[...new Set(base.map(r=>r.ma_sp).filter(Boolean))];
  let assignments=[];
  if(ids.length){const a=await supabase.from('phan_cong').select('ma_sp,mnv,trang_thai').in('ma_sp',ids);if(a.error)throw a.error;assignments=a.data||[]}
  const map=new Map(assignments.map(a=>[txt(a.ma_sp),a]));
  // Số lượng mới = DSCL gốc + tổng chênh lệch đã lưu trong DIEU_CHINH.
  let corrections=[];
  if(ids.length){const c=await supabase.from('dieu_chinh').select('ma_sp,sl_chenh_lech,trang_thai_duyet').in('ma_sp',ids).limit(10000);if(c.error)throw c.error;corrections=c.data||[]}
  const totals=new Map();for(const c of corrections){if(['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(txt(c.trang_thai_duyet).toUpperCase()))continue;const k=txt(c.ma_sp);totals.set(k,(totals.get(k)||0)+Number(c.sl_chenh_lech||0))}
  const result=base.map(r=>({...r,_assignment:map.get(txt(r.ma_sp))||null,_currentCount:baseCount(r)+(totals.get(txt(r.ma_sp))||0),_barcodes:barcodesFor(r)})).filter(r=>!term||txt(r.ma_sp).toLowerCase().includes(term.toLowerCase())||txt(r.ten_sp).toLowerCase().includes(term.toLowerCase())||r._barcodes.toLowerCase().includes(term.toLowerCase()));
  if(alive){setItems(result);setTotal(count||0)}
 }catch(e){if(alive){setItems([]);setTotal(0);setError(e.message)}}finally{if(alive)setBusy(false)}}run();return()=>{alive=false}},[page,search,threshold,materialGroup,kv,sourceByProduct,refresh]);
 const shown=useMemo(()=>items.filter(r=>state==='all'||status(r._assignment?.trang_thai)===state),[items,state]);
 async function openDetail(row){setSelected(row);setDetails([]);setEdits({});setNewKv({khu_vuc:'',sl_thuc_te:''});setDetailBusy(true);try{
  const [ct,bc,changes]=await Promise.all([supabase.from('ct_kv').select('*').eq('ma_sp',row.ma_sp).limit(500),supabase.from('bc').select('*').eq('ma_sp',row.ma_sp).limit(500),supabase.from('dieu_chinh').select('id,ct_kv_id,loai_dieu_chinh,khu_vuc_moi,sl_moi,sl_chenh_lech,trang_thai_duyet,ghi_chu').eq('ma_sp',row.ma_sp).limit(500)]);
  if(ct.error)throw ct.error;if(bc.error)throw bc.error;if(changes.error)throw changes.error;
  const cRows=ct.data||[],bRows=bc.data||[];
  const latest=new Map();for(const c of changes.data||[]){if(c.ct_kv_id!=null && !['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(txt(c.trang_thai_duyet).toUpperCase()))latest.set(String(c.ct_kv_id),c)}
  // Quy tắc nguồn: tổng SL đếm của mã trên DSCL = 0 thì ưu tiên BC;
  // nếu >0 thì CT_KV. Các dòng KV mới luôn được giữ riêng trong DIEU_CHINH.
  const useBC=(baseCount(row)===0 && bRows.length>0)||(!cRows.length&&bRows.length>0);
  const source=useBC?bRows:cRows;
  const barcodes=[...new Set([...cRows,...bRows].flatMap(x=>txt(x.barcode).split(';')).map(x=>x.trim()).filter(Boolean))].join(';');
  const regular=source.map((x,i)=>({...x,_source:useBC?'BC':'CT_KV',_rowKey:useBC?'bc-'+(x.id??i):'ct-'+(x.id??i),_barcode:txt(x.barcode)||barcodes,_savedCount:useBC?Number(x.sl_dem||0):Number(latest.get(String(x.id))?.sl_moi??x.sl_dem??0)}));
  const added=(changes.data||[]).filter(c=>txt(c.loai_dieu_chinh)==='THEM_KV'&&!['TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT'].includes(txt(c.trang_thai_duyet).toUpperCase())).map(c=>({id:c.id,khu_vuc:c.khu_vuc_moi,barcode:(c.ghi_chu||'').match(/BARCODE:([^;]*)/)?.[1]||'',_source:'KV_MOI',_rowKey:'new-'+c.id,_savedCount:Number(c.sl_moi||0),_barcode:(c.ghi_chu||'').match(/BARCODE:([^;]*)/)?.[1]||barcodes}));
  setDetails([...regular,...added]);
 }catch(e){onMessage('Không tải được chi tiết: '+e.message)}finally{setDetailBusy(false)}}
 const canEdit=admin||!!(selected&&txt(selected._assignment?.mnv)===txt(profile?.mnv));
 const actual=d=>Number(edits[d._rowKey]??d._savedCount??0);
 const delta=details.reduce((n,d)=>n+(actual(d)-Number(d._savedCount||0)),0)+(txt(newKv.khu_vuc)&&txt(newKv.sl_thuc_te)!==''?Number(newKv.sl_thuc_te)||0:0);
 async function saveChecked(){if(!selected||saving)return;if(!admin&&txt(selected._assignment?.mnv)!==txt(profile?.mnv)){onMessage('Bạn chỉ được sửa mã hàng được phân công.');return;}setSaving(true);try{
  const changed=details.filter(d=>edits[d._rowKey]!==undefined && actual(d)!==Number(d._savedCount||0));
  const kv=txt(newKv.khu_vuc),raw=txt(newKv.sl_thuc_te);
  if((kv||raw)&&(!kv||raw==='' ||!Number.isFinite(Number(raw))||Number(raw)<0))throw Error('Thêm KV: nhập Khu vực và SL thực tế hợp lệ.');
  if(changed.some(d=>!Number.isFinite(actual(d))||actual(d)<0))throw Error('SL thực tế phải là số không âm.');
  if(changed.some(d=>d._source==='BC'))throw Error('Dòng BC chưa có CT_KV ID. Hãy dùng Thêm KV để lưu số lượng thực tế.');
  const who=profile?.mnv||selected._assignment?.mnv||null;
  for(const d of changed){
   if(d._source==='KV_MOI'){
    const {error}=await supabase.from('dieu_chinh').update({sl_moi:actual(d),sl_chenh_lech:actual(d)}).eq('id',d.id);if(error)throw error;
   }else{
    const payload={ma_sp:selected.ma_sp,ct_kv_id:d.id,loai_dieu_chinh:'SUA_SO_LUONG',khu_vuc_cu:d.khu_vuc||null,khu_vuc_moi:d.khu_vuc||null,sl_cu:Number(d._savedCount||0),sl_moi:actual(d),sl_chenh_lech:actual(d)-Number(d._savedCount||0),mnv:who,nguoi_cap_nhat:who,ghi_chu:'Cập nhật đã kiểm từ chi tiết mã hàng',trang_thai_duyet:'Không cần duyệt'};
    const {error}=await supabase.from('dieu_chinh').insert(payload);if(error)throw error;
   }
  }
  if(kv&&raw!==''){
   const n=Number(raw);
   const payload={ma_sp:selected.ma_sp,ct_kv_id:null,loai_dieu_chinh:'THEM_KV',khu_vuc_cu:null,khu_vuc_moi:kv,sl_cu:0,sl_moi:n,sl_chenh_lech:n,mnv:who,nguoi_cap_nhat:who,ghi_chu:'KV mới; chỉ nhập khu vực và SL quy đổi',trang_thai_duyet:'Không cần duyệt'};
   const {error}=await supabase.from('dieu_chinh').insert(payload);if(error)throw error;
  }
  const {data:assignment,error:findError}=await supabase.from('phan_cong').select('ma_sp').eq('ma_sp',selected.ma_sp).maybeSingle();if(findError)throw findError;
  if(!assignment)throw Error('Mã chưa có trong PHAN_CONG; số lượng đã lưu nhưng chưa chuyển trạng thái.');
  const {error}=await supabase.from('phan_cong').update({trang_thai:'Đã kiểm'}).eq('ma_sp',selected.ma_sp);if(error)throw error;
  onMessage('Đã lưu số lượng, KV mới và trạng thái Đã kiểm.');setSelected(null);setRefresh(x=>x+1);
 }catch(e){onMessage('Không cập nhật được: '+e.message)}finally{setSaving(false)}}
 const columns=[
  {accessorKey:'ma_sp',header:'Mã SP'},
  {accessorKey:'ten_sp',header:'Tên sản phẩm',meta:{className:'inv-name'},cell:({getValue})=>getValue()||'—'},
  {accessorKey:'nhom_vat_tu',header:'Nhóm vật tư',meta:{className:'inv-material'},cell:({getValue})=>getValue()||'—'},
  {accessorKey:'dvt_co_ban',header:'ĐVT CB',cell:({getValue})=>getValue()||'—'},
  {id:'mnv',header:'MNV',cell:({row})=>row.original._assignment?.mnv||'—'},
  {accessorKey:'sl_so',header:'SL trên sổ',meta:{className:'inv-number'},cell:({getValue})=>fmt(getValue())},
  {id:'sl_dem',header:'SL đếm',meta:{className:'inv-number'},cell:({row})=>fmt(currentCount(row.original))},
  {id:'sl_chenh_lech',header:'SL chênh lệch',meta:{className:'inv-number'},cell:({row})=>formatDifference(currentCount(row.original)-Number(row.original.sl_so??0))},
  {id:'gt_chenh_lech',header:'GT chênh lệch',meta:{className:'inv-number'},cell:({row})=>formatDifference(amount(row.original))},
  {id:'trang_thai',header:'Trạng thái',cell:({row})=>{
   const value=status(row.original._assignment?.trang_thai);
   return <span className={'inv-status '+(value==='Đã kiểm'?'done':'pending')}>{value}</span>;
  }},
  {id:'detail',header:'Chi tiết',cell:({row})=>(
   <Button type="button" size="sm" variant="outline" onClick={()=>openDetail(row.original)}>
    <Eye size={16} aria-hidden="true"/> Xem chi tiết
   </Button>
  )},
 ];
 return <div className="inventory-page">
  <div className="inv-title"><h2>Tra cứu và đối chiếu</h2><Button type="button" variant="outline" onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={16} aria-hidden="true"/> Tải lại</Button></div>
  <div className="panel inv-compact-controls"><label>Nhóm vật tư<select value={materialGroup} onChange={e=>{setMaterialGroup(e.target.value);setPage(0)}}><option value="">Tất cả nhóm vật tư</option>{groupOptions.map(g=><option key={g} value={g}>{g}</option>)}</select></label><label>Ngưỡng |GT chênh lệch| ≥ (VNĐ)<input type="number" min="0" value={threshold} onChange={e=>{setThreshold(e.target.value);setPage(0)}}/></label><label>Khu vực (KV)<select value={kv} onChange={e=>{setKv(e.target.value);setPage(0)}}><option value="">Tất cả khu vực</option>{kvOptions.map(k=><option key={k} value={k}>{k}</option>)}</select></label><label>Trạng thái (trang hiện tại)<select value={state} onChange={e=>setState(e.target.value)}><option value="all">Tất cả</option><option>Đã kiểm</option><option>Chưa kiểm</option></select></label></div>
  <div className="inv-kpis"><div><small>Tổng mã theo bộ lọc</small><strong>{fmt(total)}</strong></div><div><small>Mã trên trang</small><strong>{fmt(items.length)}</strong></div><div><small>Đã kiểm trên trang</small><strong className="green">{items.filter(r=>status(r._assignment?.trang_thai)==='Đã kiểm').length}</strong></div><div><small>Chưa kiểm trên trang</small><strong className="orange">{items.filter(r=>status(r._assignment?.trang_thai)!=='Đã kiểm').length}</strong></div></div>
  {barcodeError&&<div className="warning">{barcodeError}</div>}{error&&<div className="warning">Không tải được danh sách: {error}</div>}
  <div className="panel inv-results"><div className="toolbar inv-table-toolbar"><input aria-label="Tìm mã sản phẩm, tên sản phẩm hoặc Barcode" placeholder="Tìm mã SP, tên sản phẩm hoặc Barcode..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/><span>{busy?'Đang tải...':`Hiển thị ${shown.length} mã trên trang ${page+1}`}</span></div><InventoryTable rows={shown} columns={columns} page={page} pageSize={PAGE_SIZE} total={total} busy={busy} setPage={setPage}/><p className="inv-hint">Lưu ý: cập nhật nhiều dòng hiện chưa giao dịch nguyên tử và Final chưa được đồng bộ tự động. Cần RPC server-side trước khi dùng dữ liệu thật.</p></div>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="panel modal inv-modal" onClick={e=>e.stopPropagation()}><div className="modalhead"><h2>Chi tiết mã {selected.ma_sp}</h2><button className="outline" onClick={()=>setSelected(null)}>Đóng</button></div><h3>{selected.ten_sp||'Chưa có tên sản phẩm'}</h3><p>MNV: {selected._assignment?.mnv||'—'} · {status(selected._assignment?.trang_thai)}</p><h3>1. Chênh lệch cũ (theo DSCL)</h3><div className="inv-kpis inv-detail-kpis"><div><small>SL đếm gốc</small><strong>{fmt(selected.sl_dem??selected.sl_duoc_dem)}</strong></div><div><small>SL trên sổ</small><strong>{fmt(selected.sl_so)}</strong></div><div><small>Lượng chênh lệch</small><strong>{fmt(Number(selected.sl_dem??selected.sl_duoc_dem??0)-Number(selected.sl_so??0))}</strong></div><div><small>GT chênh lệch</small><strong>{fmt(amount(selected))}</strong></div><div><small>ĐVT</small><strong>{selected.dvt_co_ban||'—'}</strong></div></div><h3>2. Sau kiểm tra (cập nhật từ khu vực)</h3><div className="inv-kpis inv-detail-kpis"><div><small>Tổng +/- SL</small><strong>{fmt(currentCount(selected)-baseCount(selected)+delta)}</strong></div><div><small>SL đếm hiện tại</small><strong>{fmt(currentCount(selected)+delta)}</strong></div><div><small>Chênh lệch hiện tại</small><strong>{fmt(currentCount(selected)+delta-Number(selected.sl_so??0))}</strong></div></div><h3>Chi tiết CT_KV</h3>{detailBusy?<p>Đang tải chi tiết...</p>:<div className="tablewrap"><table><thead><tr><th>Barcode</th><th>Khu vực</th><th>ĐVT nhập</th><th>SL nhập</th><th>SL đếm</th><th>SL thực tế</th><th>Trạng thái</th></tr></thead><tbody>{details.map((d,i)=><tr key={d.id||i}><td className="barcode-cell">{d._barcode||'Chưa có Barcode'}</td><td>{d.khu_vuc||'—'}</td><td>{d.dvt_nhap||'—'}</td><td>{d.sl_nhap??'—'}</td><td>{fmt(d._savedCount)}</td><td><input style={{width:100}} type="number" value={edits[d._rowKey]??d._savedCount} disabled={!canEdit} onChange={e=>setEdits(v=>({...v,[d._rowKey]:e.target.value}))}/></td><td>{d._source}</td></tr>)}</tbody></table>{!details.length&&<p className="empty">Chưa có dòng CT_KV tương ứng.</p>}</div>}<div className="panel" style={{padding:16,margin:'14px 0'}}><h3>Thêm khu vực mới</h3><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>Khu vực mới<input placeholder="Ví dụ A3" disabled={!canEdit} value={newKv.khu_vuc} onChange={e=>setNewKv(v=>({...v,khu_vuc:e.target.value}))}/></label><label>SL thực tế (quy đổi)<input type="number" min="0" disabled={!canEdit} value={newKv.sl_thuc_te} onChange={e=>setNewKv(v=>({...v,sl_thuc_te:e.target.value}))}/></label></div><p className="inv-hint">Không cần nhập ĐVT. KV mới được lưu khi bấm Cập nhật đã kiểm.</p></div><button disabled={!canEdit||saving||detailBusy} onClick={saveChecked}>{saving?"Đang cập nhật...":"Cập nhật đã kiểm"}</button><p className="inv-hint">Barcode thiếu được bổ sung từ BC khi hiển thị, nhiều mã cách nhau bằng dấu ;. Không ghi đè CT_KV.</p></div></div>}
 </div>
}

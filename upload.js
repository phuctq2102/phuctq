import * as XLSX from 'xlsx';

// Giữ đúng các cột hiện có trong schema Supabase; không tự thêm cột.
const fields = {
  dscl: ['ma_sp','ten_sp','nganh_hang','nhom_vat_tu','dvt_co_ban','sl_so','sl_dem','gt_chenh_lech'],
  ct_kv: ['ma_sp','barcode','ten_sp','khu_vuc','dvt_nhap','sl_nhap','sl_dem','sl_so'],
  bc: ['ma_sp','barcode','ten_sp','khu_vuc','dvt_co_ban','sl_dem']
};
const aliases = {
  ma_sp: ['ma_sp','ma san pham','ma sp','ma san pham','material','vat tu'],
  ten_sp: ['ten_sp','ten san pham','ten sp','mo ta vat tu'],
  nganh_hang: ['nganh_hang','nganh hang'],
  nhom_vat_tu: ['nhom_vat_tu','nhom vat tu'],
  dvt_co_ban: ['dvt_co_ban','dvt co ban','don vi do luong co ban','don vi do luong cb'],
  sl_so: ['sl_so','sl so','so luong tren so','so luong so','sl tren so','ton so','so luong ton so','sl ton','so luong ton','so luong ton kho'],
  gt_chenh_lech: ['gt_chenh_lech','gt chenh lech','gia tri chenh lech','so tien chenh lech'],
  barcode: ['barcode','bar code','ma vach','ean','ean upc','ma ean','ma barcode','ma vach san pham'],
  khu_vuc: ['khu_vuc','khu vuc','vi tri','khu vuc kiem dem','khu vuc dem'],
  dvt_nhap: ['dvt_nhap','dvt nhap','don vi nhap','dvt nhap','don vi tinh nhap','dvt quy doi','dvt nhap quy doi'],
  sl_nhap: ['sl_nhap','sl nhap','so luong nhap','so luong nhap goc'],
  sl_dem: ['sl_dem','sl dem','so luong duoc dem','so luong dem','sl kiem dem','so luong kiem dem','so luong thuc te','sl thuc te','so luong nhap quy doi','so luong nhap (quy doi)','sl quy doi','so luong quy doi']
};
const numeric = new Set(['sl_so','gt_chenh_lech','sl_nhap','sl_dem']);
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const mapping = Object.fromEntries(Object.entries(aliases).flatMap(([k,v])=>v.map(a=>[norm(a),k])));

function numberValue(value, cellLabel) {
  if(typeof value === 'number') {
    if(!Number.isFinite(value)) throw Error(`${cellLabel}: số không hợp lệ`);
    return value;
  }
  let s=String(value ?? '').trim().replace(/\s/g,'');
  if(!s) return null;
  // Dấu thập phân: 22.414, 13.87 trong xuất SAP phải giữ nguyên phần lẻ.
  if(s.includes(',') && s.includes('.')) {
    s=s.lastIndexOf(',')>s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if(s.includes(',')) {
    s=s.replace(',','.');
  }
  const n=Number(s);
  if(!Number.isFinite(n)) throw Error(`${cellLabel}: không phải số (${value})`);
  return n;
}

export async function parseExcel(file,table) {
  if(!fields[table]) throw Error('Bảng không hỗ trợ');
  if(file.size>30*1024*1024) throw Error('File vượt quá 30 MB');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellText:true});
  const sheet=wb.SheetNames.find(n=>norm(n)===norm(table))||wb.SheetNames[0];
  const ws=wb.Sheets[sheet];
  if(!ws) throw Error('Không tìm thấy sheet Excel');
  const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  const headIndex=matrix.findIndex(row=>row.some(v=>mapping[norm(v)]==='ma_sp'));
  if(headIndex<0) throw Error('Không tìm thấy cột Mã SP / Mã sản phẩm / Vật tư');
  const header=matrix[headIndex];
  const colmap=header.map(v=>mapping[norm(v)]||null);
  // Mẫu CT_KV xuất từ hệ thống: SL nhập (quy đổi) là SL đếm cơ bản.
  // Không tự suy diễn 'Số lượng tồn kho' thành SL sổ của DSCL.
  if(table==='ct_kv'){
    header.forEach((v,j)=>{
      const h=norm(v);
      if(h==='so luong nhap quy doi'||h==='sl nhap quy doi') colmap[j]='sl_dem';
      if(h==='so luong nhap') colmap[j]='sl_nhap';
      if(h==='so luong ton kho') colmap[j]=null;
    });
  }
  const columns=[...new Set(colmap.filter(c=>fields[table].includes(c)))];
  if(!columns.includes('ma_sp')) throw Error('Thiếu cột mã sản phẩm');
  if(columns.length<2) throw Error('Không nhận diện đủ cột. Kiểm tra tiêu đề Excel');
  // Không chấp nhận file CT_KV chỉ có mã và tên: ngăn thay thế bằng dữ liệu thiếu.
  const required = table === 'ct_kv'
    ? ['ma_sp','ten_sp','sl_dem']
    : table === 'bc'
    ? ['ma_sp','barcode']
    : ['ma_sp','ten_sp','sl_dem','gt_chenh_lech'];
  const missing = required.filter(k => !columns.includes(k));
  if (missing.length) throw Error(`File ${table.toUpperCase()} thiếu cột: ${missing.join(', ')}. Chưa thay đổi dữ liệu cũ.`);
  // SAP: N là số tiền chênh lệch tuyệt đối, J là lượng chênh lệch có dấu.
  const diffIndex=table==='dscl'?header.findIndex(v=>norm(v)==='luong chenh lech'):-1;
  const rows=[];
  for(let i=headIndex+1;i<matrix.length;i++) {
    const row=matrix[i];
    if(!row.some(v=>String(v??'').trim())) continue;
    const out={};
    colmap.forEach((key,j)=>{
      if(!key||!fields[table].includes(key)||Object.hasOwn(out,key))return;
      const value=row[j];
      if(value===null||value===undefined||String(value).trim()==='')return;
      if(numeric.has(key))out[key]=numberValue(value,`Dòng Excel ${i+1}, ${key}`);
      else out[key]=String(value).trim();
    });
    if(!out.ma_sp)throw Error(`Dòng Excel ${i+1} thiếu mã sản phẩm`);
    if(table==='dscl' && diffIndex>=0 && out.gt_chenh_lech!==undefined){
      const delta=numberValue(row[diffIndex],`Dòng Excel ${i+1}, lượng chênh lệch`);
      if(delta!==null)out.gt_chenh_lech=Math.abs(out.gt_chenh_lech)*Math.sign(delta);
    }
    if(table==='dscl' && !Object.hasOwn(out,'sl_dem')) throw Error(`Dòng Excel ${i+1}: thiếu giá trị Số lượng được đếm (cột I). Không thay thế dữ liệu.`);
    rows.push(out);
  }
  if(!rows.length)throw Error('Không có dòng dữ liệu');
  if(table==='dscl'){
    const sample=rows.slice(0,5).map(r=>`${r.ma_sp}: ${r.sl_dem}`).join('; ');
    console.info('[V10 DSCL] SL đếm Excel mẫu:',sample);
    if(rows.every(r=>r.sl_dem===0)) throw Error('Toàn bộ SL đếm DSCL đều bằng 0. Hãy kiểm tra Excel trước khi thay thế dữ liệu.');
  }
  return {table,sheet,columns,rows};
}

// Một yêu cầu RPC duy nhất; backend DELETE + INSERT trong cùng transaction.
// Không chia batch, không staging. Giới hạn phụ thuộc kích thước request của Supabase.
export async function replaceTable(supabase, table, rows, onProgress=()=>{}) {
  if(!fields[table] || !Array.isArray(rows) || !rows.length) throw Error('Bảng hoặc dữ liệu không hợp lệ');
  onProgress(0, rows.length);
  const {data,error}=await supabase.rpc('v10_replace_direct',{
    p_table:table,p_rows:rows
  });
  if(error) {
    if (/Could not find the function.*v10_replace_direct|schema cache/i.test(error.message)) {
      throw Error('Supabase chưa có hàm v10_replace_direct(p_table, p_rows). Vào SQL Editor chạy toàn bộ file SUPABASE_REPLACE_DIRECT.sql trong bộ ZIP, sau đó thử lại. Dữ liệu cũ không bị thay đổi bởi lỗi này.');
    }
    throw Error('Thay thế không thành công: '+error.message+' (giao dịch rollback nếu SQL phát sinh lỗi)');
  }
  if(table==='dscl'){
    const sample=rows.find(r=>r.sl_dem!==0);
    const {data:check,error:checkError}=await supabase.from('dscl').select('ma_sp,sl_dem').eq('ma_sp',sample.ma_sp).maybeSingle();
    if(checkError) throw Error('Đã gửi DSCL nhưng chưa xác minh được dữ liệu lưu: '+checkError.message);
    if(!check || Number(check.sl_dem)!==Number(sample.sl_dem)) throw Error(`DSCL đã upload nhưng Supabase lưu SL đếm không đúng cho mã ${sample.ma_sp}: Excel=${sample.sl_dem}, Supabase=${check?.sl_dem??'không tìm thấy'}. Hãy chạy SUPABASE_REPLACE_DIRECT.sql trong ZIP để cập nhật RPC, rồi upload lại DSCL.`);
  }
  onProgress(rows.length,rows.length);
  return data;
}

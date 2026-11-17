import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return reply({error:'Thiếu cấu hình máy chủ'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'Chưa đăng nhập'},401);
  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(token);
  if(authError||!user)return reply({error:'Phiên đăng nhập không hợp lệ'},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:caller,error:callerError}=await admin.from('users').select('id,vai_tro,dang_hoat_dong').eq('id',user.id).maybeSingle();
  if(callerError)return reply({error:'Không kiểm tra được quyền'},500);
  if(!caller||String(caller.vai_tro).toUpperCase()!=='ADMIN'||caller.dang_hoat_dong!==true)return reply({error:'Chỉ ADMIN đang hoạt động được đặt lại mật khẩu'},403);
  const body=await req.json().catch(()=>({}));
  if(body.mode==='list'){
   const {data,error}=await admin.from('users').select('id,mnv,ho_ten,vai_tro,dang_hoat_dong').order('mnv').limit(1000);
   if(error)return reply({error:'Không đọc được danh sách tài khoản'},500);
   return reply({ok:true,users:data||[]});
  }
  if(body.mode!=='single')return reply({error:'Chỉ hỗ trợ đặt lại từng tài khoản để tránh thay đổi hàng loạt ngoài ý muốn'},400);
  const mnv=String(body.mnv??'').trim().toUpperCase();
  const normalized=mnv==='ADMIN'?'ADMIN':/^\d{1,3}$/.test(mnv)?mnv.padStart(3,'0'):'';
  const password=String(body.password??'');
  if(!normalized)return reply({error:'MNV không hợp lệ'},400);
  if(password.length<12||password.length>128)return reply({error:'Mật khẩu phải có 12–128 ký tự'},400);
  const {data:target,error:targetError}=await admin.from('users').select('id,mnv,vai_tro').eq('mnv',normalized).maybeSingle();
  if(targetError)return reply({error:'Không đọc được tài khoản'},500);
  if(!target)return reply({error:'Không tìm thấy tài khoản trong public.users'},404);
  const {error:resetError}=await admin.auth.admin.updateUserById(target.id,{password});
  if(resetError)return reply({error:'Supabase Auth từ chối đặt lại mật khẩu: '+resetError.message},400);
  return reply({ok:true,mnv:target.mnv});
 }catch(_e){return reply({error:'Không xử lý được yêu cầu'},500)}
});

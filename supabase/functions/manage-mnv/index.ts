import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const mnvOf=(v:unknown)=>{const s=String(v??'').trim();if(!/^\d{1,3}$/.test(s))throw Error('MNV phải gồm 1–3 chữ số');return s.padStart(3,'0')};
const emailFor=(mnv:string)=>`mnv-${mnv}@staff.example.com`;
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return json({error:'Chưa đăng nhập'},401);
  const client=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user},error:authError}=await client.auth.getUser(token);if(authError||!user)return json({error:'Phiên đăng nhập không hợp lệ'},401);
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:profile,error:profileError}=await admin.from('users').select('vai_tro,dang_hoat_dong').eq('id',user.id).maybeSingle();
  if(profileError||profile?.vai_tro!=='ADMIN'||!profile?.dang_hoat_dong)return json({error:'Chỉ ADMIN đang hoạt động được quản lý tài khoản'},403);
  const b=await req.json();const action=String(b.action||'');
  if(action==='list'){const {data,error}=await admin.from('users').select('id,mnv,ho_ten,vai_tro,dang_hoat_dong').order('mnv').limit(1000);if(error)throw error;return json({users:data})}
  const mnv=mnvOf(b.mnv);
  if(action==='create'){
   const password=String(b.password||'');if(password.length<8||password.length>128)throw Error('Mật khẩu phải có 8–128 ký tự');
   const role=b.vai_tro==='ADMIN'?'ADMIN':'NHAN_VIEN';
   if(role==='ADMIN')throw Error('Không tạo ADMIN qua chức năng nhập hàng loạt; chỉ quản lý quyền Admin bằng quy trình riêng');
   const {data:existing,error:lookupError}=await admin.from('users').select('id').eq('mnv',mnv).maybeSingle();if(lookupError)throw lookupError;if(existing)throw Error('MNV đã tồn tại');
   const {data:created,error:createError}=await admin.auth.admin.createUser({email:emailFor(mnv),password,email_confirm:true});if(createError)throw createError;
   const {error:insertError}=await admin.from('users').insert({id:created.user.id,mnv,ho_ten:String(b.ho_ten||'').trim(),vai_tro:role,dang_hoat_dong:true});
   if(insertError){await admin.auth.admin.deleteUser(created.user.id);throw insertError}
   return json({ok:true,mnv});
  }
  const {data:target,error:findError}=await admin.from('users').select('id,mnv,vai_tro').eq('mnv',mnv).maybeSingle();if(findError)throw findError;if(!target)throw Error('Không tìm thấy MNV');
  if(target.vai_tro==='ADMIN')throw Error('Không thay đổi tài khoản ADMIN tại đây');
  if(action==='reset_password'){const password=String(b.password||'');if(password.length<8||password.length>128)throw Error('Mật khẩu phải có 8–128 ký tự');const {error}=await admin.auth.admin.updateUserById(target.id,{password});if(error)throw error;return json({ok:true})}
  if(action==='disable'||action==='enable'){
   const enabled=action==='enable';const {error}=await admin.auth.admin.updateUserById(target.id,{ban_duration:enabled?'none':'876000h'});if(error)throw error;
   const {error:dbError}=await admin.from('users').update({dang_hoat_dong:enabled}).eq('id',target.id);if(dbError)throw dbError;
   return json({ok:true});
  }
  return json({error:'Thao tác không hợp lệ'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Lỗi máy chủ'},400)}
});

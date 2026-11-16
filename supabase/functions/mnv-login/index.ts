import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const { mnv, password } = await req.json();
    const code = String(mnv ?? '').trim();
    if (!/^\d{3}$/.test(code) || typeof password !== 'string' || !password) return reply({ error: 'MNV hoặc mật khẩu không đúng' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) return reply({ error: 'Máy chủ chưa cấu hình' }, 500);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: lookupError } = await admin.from('users').select('id,dang_hoat_dong').eq('mnv', code).maybeSingle();
    if (lookupError) throw lookupError;
    if (!profile || !profile.dang_hoat_dong) return reply({ error: 'MNV hoặc mật khẩu không đúng' }, 401);
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.id);
    if (userError || !userResult?.user?.email) return reply({ error: 'MNV hoặc mật khẩu không đúng' }, 401);
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: userResult.user.email, password });
    if (error || !data.session) return reply({ error: 'MNV hoặc mật khẩu không đúng' }, 401);
    return reply({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (_error) {
    return reply({ error: 'Không xử lý được yêu cầu đăng nhập' }, 500);
  }
});

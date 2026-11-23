-- V10 RESET KY KIEM KE - chay mot lan trong Supabase SQL Editor.
-- Khong xoa du lieu khi chay file SQL nay; chi tao RPC.
-- Ham chi xoa khi Admin bam nut va xac nhan trong web.
create or replace function public.v10_reset_ky_kiem_ke()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_table text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Chi Admin moi duoc Reset ky kiem ke';
  end if;
  perform pg_advisory_xact_lock(915102);
  -- Xoa bang phu thuoc truoc; mot loi bat ky se rollback toan bo.
  foreach v_table in array array[
    'admin_final_check','final_lines','dieu_chinh','dem_them',
    'phan_cong','ct_kv','dscl','audit_log'
  ] loop
    if to_regclass(format('public.%I',v_table)) is not null then
      execute format('delete from public.%I',v_table);
    end if;
  end loop;
  -- KHONG cham vao bc, users, cau_hinh, auth.users.
  return true;
end;
$$;
revoke all on function public.v10_reset_ky_kiem_ke() from public, anon;
grant execute on function public.v10_reset_ky_kiem_ke() to authenticated;

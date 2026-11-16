-- Chạy một lần trong Supabase SQL Editor. Giữ nguyên BC và USERS.
create extension if not exists pgcrypto;
create table if not exists public.v10_ky_kiem_ke (
 id uuid primary key default gen_random_uuid(),
 ma_ch text not null,
 ngay_dong date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
 dong_luc timestamptz not null default now(),
 trang_thai text not null default 'DA_DONG' check (trang_thai in ('DA_DONG')),
 dscl jsonb not null, ct_kv jsonb not null, dieu_chinh jsonb not null,
 final_data jsonb not null, phan_cong jsonb not null default '[]',
 dem_them jsonb not null default '[]', admin_final_check jsonb not null default '[]',
 sync_count integer not null default 0,
 created_by uuid default auth.uid()
);
create index if not exists v10_ky_ma_ch_ngay on public.v10_ky_kiem_ke(ma_ch,ngay_dong desc);
alter table public.v10_ky_kiem_ke enable row level security;
revoke all on public.v10_ky_kiem_ke from anon;
grant select on public.v10_ky_kiem_ke to authenticated;
drop policy if exists v10_ky_admin_read on public.v10_ky_kiem_ke;
create policy v10_ky_admin_read on public.v10_ky_kiem_ke for select to authenticated using (public.is_admin());

-- Tất cả thao tác đóng sổ và dọn kỳ là một transaction trên máy chủ.
-- Chỉ Admin được gọi. Dùng khóa để tránh hai thao tác chạy đồng thời.
create or replace function public.v10_dong_so(p_final jsonb default '[]'::jsonb)
returns table(id uuid, ma_ch text, ngay_dong date)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ma_ch text; v_count integer; v_id uuid; v_ngay date;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Chỉ Admin được đóng sổ'; end if;
 perform pg_advisory_xact_lock(915102);
 if exists(select 1 from public.v10_ky_kiem_ke k where k.id is not null and k.dong_luc > now()-interval '2 seconds') then
   raise exception 'Vừa có kỳ được đóng. Kiểm tra lịch sử trước khi thử lại';
 end if;
 select count(distinct nullif(trim(nha_may::text),'')),min(nullif(trim(nha_may::text),''))
 into v_count,v_ma_ch from public.dscl;
 if v_count <> 1 or v_ma_ch is null then
   raise exception 'DSCL phải có đúng một mã cửa hàng ở cột nha_may. Đang có % mã',v_count;
 end if;
 if not exists(select 1 from public.ct_kv) then raise exception 'CT_KV đang trống'; end if;
 v_ngay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
 insert into public.v10_ky_kiem_ke(ma_ch,ngay_dong,dscl,ct_kv,dieu_chinh,final_data,phan_cong,dem_them,admin_final_check)
 select v_ma_ch,v_ngay,
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.dscl t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.ct_kv t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.dieu_chinh t),
  coalesce(p_final,'[]'::jsonb),
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.phan_cong t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.dem_them t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.admin_final_check t)
 returning v10_ky_kiem_ke.id into v_id;
 return query select v_id,v_ma_ch,v_ngay;
end $$;

create or replace function public.v10_bat_dau_ky_moi(p_archive_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_current_dscl jsonb; v_saved_dscl jsonb; v_saved_ct jsonb; v_saved_dc jsonb; v_saved_pc jsonb; v_saved_dt jsonb; v_saved_fc jsonb; v_saved_ac jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Chỉ Admin được bắt đầu kỳ mới'; end if;
 perform pg_advisory_xact_lock(915102);
 select k.dscl,k.ct_kv,k.dieu_chinh,k.phan_cong,k.dem_them,k.final_data,k.admin_final_check into v_saved_dscl,v_saved_ct,v_saved_dc,v_saved_pc,v_saved_dt,v_saved_fc,v_saved_ac from public.v10_ky_kiem_ke k where k.id=p_archive_id;
 if not exists(select 1 from public.dscl) then raise exception 'Dữ liệu làm việc đã trống, không cần xóa lần nữa'; end if;
 if v_saved_dscl is null then raise exception 'Không tìm thấy bản lưu kỳ kiểm kê'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) into v_current_dscl from public.dscl t;
 if v_current_dscl is distinct from v_saved_dscl
 or (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.ct_kv t) is distinct from v_saved_ct
 or (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.dieu_chinh t) is distinct from v_saved_dc
 or (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.phan_cong t) is distinct from v_saved_pc
 or (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.dem_them t) is distinct from v_saved_dt
 or (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.admin_final_check t) is distinct from v_saved_ac
 then
   raise exception 'DSCL đã thay đổi sau khi đóng sổ. Không xóa để tránh mất dữ liệu chưa lưu';
 end if;
 -- Xóa bảng phụ trước, dữ liệu gốc sau; mọi thao tác rollback nếu có lỗi.
 delete from public.admin_final_check;
 delete from public.final_lines;
 delete from public.dem_them;
 delete from public.dieu_chinh;
 delete from public.phan_cong;
 delete from public.ct_kv;
 delete from public.dscl;
 -- KHÔNG xóa public.bc, public.users, v10_ky_kiem_ke.
 return true;
end $$;
revoke all on function public.v10_dong_so(jsonb) from public,anon;
revoke all on function public.v10_bat_dau_ky_moi(uuid) from public,anon;
grant execute on function public.v10_dong_so(jsonb) to authenticated;
grant execute on function public.v10_bat_dau_ky_moi(uuid) to authenticated;
notify pgrst,'reload schema';

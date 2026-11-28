-- Cài mốc Reset dùng chung cho các phiên đồng bộ. SQL này không chạy Reset.
create table public.v10_clkk_folder_state (
  id boolean primary key default true check (id),
  reset_at timestamptz not null
);
alter table public.v10_clkk_folder_state enable row level security;
revoke all on public.v10_clkk_folder_state from public, anon, authenticated;
grant select on public.v10_clkk_folder_state to authenticated;
create policy clkk_folder_state_admin on public.v10_clkk_folder_state
  for select to authenticated using ((select public.is_admin()));

create function public.v10_clkk_folder_write(p_kind text, p_rows jsonb, p_reset_at timestamptz, p_modified_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_reset timestamptz;
begin
  if auth.uid() is null or public.is_admin() is distinct from true then
    raise exception 'Chỉ Admin mới được đồng bộ thư mục';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(915102);
  select reset_at into current_reset from public.v10_clkk_folder_state where id;
  if p_reset_at is distinct from current_reset or p_modified_at is null or p_modified_at <= current_reset then
    raise exception 'Đã Reset từ phiên khác. File cũ không được đồng bộ.';
  end if;

  case p_kind
    when 'schedule' then
      insert into public.v10_clkk_lich(ma_ch,ngay_moi,ngay_cu,thong_tin)
      select ma_ch,ngay_moi,ngay_cu,thong_tin
      from jsonb_to_recordset(p_rows) as r(ma_ch text,ngay_moi date,ngay_cu date,thong_tin jsonb)
      on conflict (ma_ch,ngay_moi) do update set ngay_cu=excluded.ngay_cu,thong_tin=excluded.thong_tin;
    when 'sap' then
      insert into public.v10_clkk_sap(ma_ch,thang,dong)
      select ma_ch,thang,dong from jsonb_to_recordset(p_rows) as r(ma_ch text,thang date,dong jsonb)
      on conflict (ma_ch,thang) do update set dong=excluded.dong;
    when 'staff' then
      insert into public.v10_clkk_nhan_su(ma_ch,mnv,ten_nv)
      select ma_ch,mnv,ten_nv from jsonb_to_recordset(p_rows) as r(ma_ch text,mnv text,ten_nv text)
      on conflict (ma_ch,mnv) do update set ten_nv=excluded.ten_nv;
    when 'hcxl' then
      if exists (
        select 1 from jsonb_to_recordset(p_rows) as r(ma_ch text,ngay_moi date)
        where not exists (select 1 from public.v10_clkk_lich l where l.ma_ch=r.ma_ch and l.ngay_moi=r.ngay_moi)
        or 1 <> (select count(*) from public.v10_clkk_lich l where l.ma_ch=r.ma_ch)
      ) then
        raise exception 'Lịch HCXL đã thay đổi. App sẽ đối chiếu lại ở lượt tiếp theo.';
      end if;
      insert into public.v10_clkk_hcxl(ma_ch,ngay_moi,dong)
      select ma_ch,ngay_moi,dong from jsonb_to_recordset(p_rows) as r(ma_ch text,ngay_moi date,dong jsonb)
      on conflict (ma_ch,ngay_moi) do update set dong=excluded.dong;
    else raise exception 'Loại dữ liệu đồng bộ không hợp lệ';
  end case;
end;
$$;

revoke all on function public.v10_clkk_folder_write(text,jsonb,timestamptz,timestamptz) from public, anon;
grant execute on function public.v10_clkk_folder_write(text,jsonb,timestamptz,timestamptz) to authenticated;

-- Cài hàm Reset. Chỉ lệnh gọi được xác nhận mới xóa dữ liệu.
create or replace function public.v10_reset_ky_kiem_ke(p_confirmation text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
begin
  if auth.uid() is null or public.is_admin() is distinct from true then
    raise exception 'Chỉ Admin mới được Reset kỳ kiểm kê';
  end if;
  if p_confirmation is distinct from 'RESET' then
    raise exception 'Cần nhập RESET để xác nhận xóa dữ liệu';
  end if;

  -- RPC hiện hành giữ khóa kỳ đến cuối giao dịch và xử lý trigger Final.
  if public.v10_reset_ky_kiem_ke() is distinct from true then
    raise exception 'Không thể xóa dữ liệu làm việc của kỳ kiểm kê';
  end if;

  foreach v_table in array array[
    'v10_clkk_hcxl', 'v10_clkk_nhan_su', 'v10_clkk_sap', 'v10_clkk_lich',
    'v10_nganh_hang', 'v10_ky_kiem_ke', 'dscl_backup_20261114',
    'dscl_staging', 'v10_upload_stage', 'v10_bc_upload_stage'
  ] loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is not null then
      execute pg_catalog.format('delete from public.%I where true', v_table);
    end if;
  end loop;

  insert into public.v10_clkk_folder_state(id,reset_at) values (true,pg_catalog.clock_timestamp())
  on conflict (id) do update set reset_at=excluded.reset_at;
  return true;
end;
$$;

revoke all on function public.v10_reset_ky_kiem_ke(text) from public, anon;
grant execute on function public.v10_reset_ky_kiem_ke(text) to authenticated;
notify pgrst, 'reload schema';

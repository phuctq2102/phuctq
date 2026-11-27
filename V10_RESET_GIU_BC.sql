-- Cài hàm Reset. Chỉ lệnh gọi được xác nhận mới xóa dữ liệu.
create function public.v10_reset_ky_kiem_ke(p_confirmation text)
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

  return true;
end;
$$;

revoke all on function public.v10_reset_ky_kiem_ke(text) from public, anon;
grant execute on function public.v10_reset_ky_kiem_ke(text) to authenticated;
notify pgrst, 'reload schema';

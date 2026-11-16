-- Chạy một lần trong Supabase SQL Editor trước khi sử dụng Final mới.
create table if not exists public.admin_final_check (
 ma_sp text primary key,
 revision text not null,
 confirmed_at timestamptz not null default now(),
 confirmed_by uuid not null default auth.uid()
);
alter table public.admin_final_check enable row level security;
drop policy if exists admin_final_check_select on public.admin_final_check;
create policy admin_final_check_select on public.admin_final_check for select to authenticated using ((select public.is_admin()));
drop policy if exists admin_final_check_insert on public.admin_final_check;
create policy admin_final_check_insert on public.admin_final_check for insert to authenticated with check ((select public.is_admin()) and confirmed_by=auth.uid());
drop policy if exists admin_final_check_update on public.admin_final_check;
create policy admin_final_check_update on public.admin_final_check for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()) and confirmed_by=auth.uid());

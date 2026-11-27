create table public.v10_clkk_hcxl (
  ma_ch text not null check (btrim(ma_ch) <> ''),
  ngay_moi date not null,
  dong jsonb not null check (jsonb_typeof(dong) = 'array' and jsonb_array_length(dong) > 0),
  primary key (ma_ch, ngay_moi)
);

create table public.v10_clkk_nhan_su (
  ma_ch text not null check (btrim(ma_ch) <> ''),
  mnv text not null check (btrim(mnv) <> ''),
  ten_nv text not null check (btrim(ten_nv) <> ''),
  primary key (ma_ch, mnv)
);

alter table public.v10_clkk_hcxl enable row level security;
alter table public.v10_clkk_nhan_su enable row level security;
revoke all on public.v10_clkk_hcxl, public.v10_clkk_nhan_su from public, anon, authenticated;
grant select, insert, update on public.v10_clkk_hcxl, public.v10_clkk_nhan_su to authenticated;
create policy clkk_admin_hcxl on public.v10_clkk_hcxl for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy clkk_admin_nhan_su on public.v10_clkk_nhan_su for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
notify pgrst, 'reload schema';

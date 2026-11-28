create table public.v10_dashboard_dscl (
  ma_ch text not null,
  ngay_moi date not null,
  dong jsonb not null check (jsonb_typeof(dong) = 'array' and jsonb_array_length(dong) > 0),
  primary key (ma_ch, ngay_moi),
  foreign key (ma_ch, ngay_moi) references public.v10_clkk_lich(ma_ch, ngay_moi) on delete cascade
);

alter table public.v10_dashboard_dscl enable row level security;
revoke all on public.v10_dashboard_dscl from public, anon, authenticated;
grant select, insert, update on public.v10_dashboard_dscl to authenticated;
create policy v10_dashboard_dscl_admin on public.v10_dashboard_dscl for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
notify pgrst, 'reload schema';

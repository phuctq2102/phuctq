begin;

create table public.v10_clkk_lich (
  ma_ch text not null check (ma_ch <> ''),
  ngay_moi date not null,
  ngay_cu date not null check (ngay_cu < ngay_moi),
  thong_tin jsonb not null default '{}',
  primary key (ma_ch, ngay_moi)
);

create table public.v10_clkk_sap (
  ma_ch text not null check (ma_ch <> ''),
  thang date not null check (extract(day from thang) = 1),
  dong jsonb not null check (jsonb_typeof(dong) = 'array' and jsonb_array_length(dong) > 0),
  primary key (ma_ch, thang)
);

alter table public.v10_clkk_lich enable row level security;
alter table public.v10_clkk_sap enable row level security;
revoke all on public.v10_clkk_lich, public.v10_clkk_sap from public, anon, authenticated;
grant select, insert, update on public.v10_clkk_lich, public.v10_clkk_sap to authenticated;
create policy clkk_admin_lich on public.v10_clkk_lich for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy clkk_admin_sap on public.v10_clkk_sap for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create function public.v10_clkk_cua_hang()
returns text[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(distinct upper(btrim(ma_ch))), '{}')
  from public.dscl
  where (select public.is_admin()) and nullif(btrim(ma_ch), '') is not null;
$$;

create function public.v10_clkk_mch3(p_ma_ch text, p_ngay_moi date)
returns table(thang date, mch2 text, mch3 text, fresh boolean, cl_goc numeric, cl_mch3 numeric, doanh_thu numeric)
language sql stable security invoker set search_path = '' as $$
  with normalized as (
    select s.thang,
      lower(regexp_replace(rtrim(btrim(r.mch2), ', '), '[[:space:]]+', ' ', 'g')) as mch2,
      lower(regexp_replace(btrim(r.mch3), '[[:space:]]+', ' ', 'g')) as mch3,
      r.cl, r.dt
    from public.v10_clkk_lich l
    join public.v10_clkk_sap s on s.ma_ch = l.ma_ch
      and s.thang between (date_trunc('month', l.ngay_cu::timestamp) + interval '1 month')::date
                      and date_trunc('month', l.ngay_moi::timestamp)::date
    cross join lateral jsonb_to_recordset(s.dong) as r(mch2 text, mch3 text, cl numeric, dt numeric)
    where l.ma_ch = p_ma_ch and l.ngay_moi = p_ngay_moi
  )
  select n.thang, n.mch2, n.mch3, nullif(n.mch2, '') = 'thực phẩm tươi sống',
    sum(n.cl), least(sum(n.cl), 0), sum(n.dt)
  from normalized n
  group by n.thang, n.mch2, n.mch3
  order by n.thang, n.mch2, n.mch3;
$$;

revoke all on function public.v10_clkk_cua_hang(), public.v10_clkk_mch3(text, date) from public, anon;
grant execute on function public.v10_clkk_cua_hang(), public.v10_clkk_mch3(text, date) to authenticated;
commit;

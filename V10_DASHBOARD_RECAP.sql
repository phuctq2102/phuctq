create function public.v10_clkk_recap(p_month date)
returns table(ma_ch text, ngay_moi date, ten_ch text, gdv text, qlkv text, clkk numeric, doanh_thu numeric, hcxl numeric, tinh_trang text)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select date_trunc('month', p_month::timestamp)::date as month_start where p_month is not null
    union all
    select distinct date_trunc('month', l.ngay_moi::timestamp)::date
    from public.v10_clkk_lich l
    where p_month is null and (select public.is_admin())
  )
  select g.ma_ch, g.ngay_moi, g.ten_ch, g.gdv,
    coalesce(
      (select nullif(btrim(value), '') from jsonb_each_text(l.thong_tin)
        where lower(btrim(key)) in ('qlkv/gđst','qlkv / gđst','qlkv','quản lý khu vực')
          and nullif(btrim(value), '') is not null
        order by case lower(btrim(key)) when 'qlkv' then 1 when 'quản lý khu vực' then 2 else 3 end, key limit 1),
      'Chưa có QLKV'
    ),
    g.clkk, g.doanh_thu,
    (select case when count(*) = count(r.thanh_tien) then sum(r.thanh_tien) end
     from jsonb_to_recordset(h.dong) as r(thanh_tien numeric)),
    g.tinh_trang
  from months m
  cross join lateral public.v10_clkk_gdv(m.month_start) g
  join public.v10_clkk_lich l on l.ma_ch=g.ma_ch and l.ngay_moi=g.ngay_moi
  left join public.v10_clkk_hcxl h on h.ma_ch=g.ma_ch and h.ngay_moi=g.ngay_moi
  order by g.ngay_moi desc, g.gdv, g.ma_ch;
$$;
revoke all on function public.v10_clkk_recap(date) from public, anon;
grant execute on function public.v10_clkk_recap(date) to authenticated;
notify pgrst, 'reload schema';

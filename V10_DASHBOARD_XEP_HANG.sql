create function public.v10_dashboard_top_dscl(p_periods jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with keys as (
    select distinct ma_ch, ngay_moi
    from jsonb_to_recordset(p_periods) as p(ma_ch text, ngay_moi date)
  ), available as (
    select d.* from keys k
    join public.v10_dashboard_dscl d using (ma_ch, ngay_moi)
    where (select public.is_admin())
  ), products as (
    select r.ma_sp, max(nullif(btrim(r.ten_sp), '')) as ten_sp, sum(r.gt_chenh_lech) as net
    from available d
    cross join lateral jsonb_to_recordset(d.dong) as r(ma_sp text, ten_sp text, gt_chenh_lech numeric)
    where nullif(btrim(r.ma_sp), '') is not null
    group by r.ma_sp
  )
  select jsonb_build_object(
    'matched', (select count(*) from available),
    'negative', coalesce((select jsonb_agg(n order by n.net, n.ma_sp)
       from (select * from products where net < 0 order by net, ma_sp limit 10) n), '[]'::jsonb),
    'positive', coalesce((select jsonb_agg(p order by p.net desc, p.ma_sp)
       from (select * from products where net > 0 order by net desc, ma_sp limit 10) p), '[]'::jsonb)
  );
$$;
revoke all on function public.v10_dashboard_top_dscl(jsonb) from public, anon;
grant execute on function public.v10_dashboard_top_dscl(jsonb) to authenticated;
notify pgrst, 'reload schema';

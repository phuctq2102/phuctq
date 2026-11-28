create or replace function public.v10_clkk_mch3(p_ma_ch text, p_ngay_moi date)
returns table(thang date, mch2 text, mch3 text, fresh boolean, cl_goc numeric, cl_mch3 numeric, doanh_thu numeric)
language sql stable security invoker set search_path = '' as $$
  with normalized as (
    select s.thang,
      lower(regexp_replace(rtrim(btrim(r.mch2), ', '), '[[:space:]]+', ' ', 'g')) as mch2,
      lower(regexp_replace(btrim(r.mch3), '[[:space:]]+', ' ', 'g')) as mch3,
      r.cl, r.dt
    from public.v10_clkk_lich l
    join public.v10_clkk_sap s on s.ma_ch = l.ma_ch
      and (l.ngay_cu is null or s.thang >= (date_trunc('month', l.ngay_cu::timestamp) + interval '1 month')::date)
      and s.thang <= date_trunc('month', l.ngay_moi::timestamp)::date
    cross join lateral jsonb_to_recordset(s.dong) as r(mch2 text, mch3 text, cl numeric, dt numeric)
    where l.ma_ch = p_ma_ch and l.ngay_moi = p_ngay_moi
  )
  select n.thang, n.mch2, n.mch3, nullif(n.mch2, '') = 'thực phẩm tươi sống',
    sum(n.cl), least(sum(n.cl), 0), sum(n.dt)
  from normalized n
  group by n.thang, n.mch2, n.mch3
  order by n.thang, n.mch2, n.mch3;
$$;

notify pgrst, 'reload schema';

create index v10_clkk_lich_by_day on public.v10_clkk_lich (ngay_moi);

create function public.v10_clkk_gdv(p_month date)
returns table(ma_ch text, ngay_moi date, ten_ch text, gdv text, clkk numeric, doanh_thu numeric, tinh_trang text)
language sql stable security invoker set search_path = '' as $$
  with periods as (
    select l.*,
      coalesce(nullif(btrim(l.thong_tin->>'Tên cửa hàng'), ''), l.ma_ch) as store_name,
      coalesce(
        (select nullif(btrim(value), '') from jsonb_each_text(l.thong_tin)
          where lower(btrim(key)) in ('gđv', 'gdv', 'giám đốc vùng') and nullif(btrim(value), '') is not null
          order by key limit 1),
        'Chưa có GĐV'
      ) as director,
      (date_trunc('month', l.ngay_cu::timestamp) + interval '1 month')::date as first_month,
      date_trunc('month', l.ngay_moi::timestamp)::date as final_month
    from public.v10_clkk_lich l
    where (select public.is_admin())
      and l.ngay_moi >= p_month
      and l.ngay_moi < p_month + interval '1 month'
  ), details as (
    select p.*, c.*,
      coalesce(p.first_month, c.earliest_month) as start_month
    from periods p
    cross join lateral (
      select count(distinct g.thang) as loaded_months,
        min(g.thang) as earliest_month,
        coalesce(sum(g.cl_mch3) filter (where not g.fresh),0) as amount,
        sum(g.doanh_thu) filter (where not g.fresh) as revenue,
        bool_or(g.fresh is null) as unknown_mch2
      from public.v10_clkk_mch3(p.ma_ch, p.ngay_moi) g
    ) c
  ), checked as (
    select d.*, case
        when d.first_month > d.final_month then 'Kỳ cũ và kỳ mới cùng tháng'
        when d.start_month is null or d.loaded_months <>
          (extract(year from d.final_month) - extract(year from d.start_month)) * 12
          + extract(month from d.final_month) - extract(month from d.start_month) + 1
        then 'Thiếu dữ liệu SAP'
        when d.unknown_mch2 then 'Có MCH2 chưa phân loại'
        when d.revenue is null then 'Chưa có doanh thu'
        else null
      end as issue
    from details d
  )
  select c.ma_ch, c.ngay_moi, c.store_name, c.director,
    case when c.issue is null or c.issue = 'Chưa có doanh thu' then c.amount end,
    case when c.issue is null then c.revenue end, c.issue
  from checked c order by c.ngay_moi desc, c.director, c.ma_ch;
$$;
revoke all on function public.v10_clkk_gdv(date) from public, anon;
grant execute on function public.v10_clkk_gdv(date) to authenticated;
notify pgrst, 'reload schema';

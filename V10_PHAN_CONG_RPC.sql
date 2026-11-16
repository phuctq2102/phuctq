-- Xoa chi overload RPC cu (khong loc nguong); KHONG xoa bang hay du lieu.
DROP FUNCTION IF EXISTS public.v10_auto_assign(integer);
-- CHAY SAU KHI SAO LUU. Phan cong tu dong va import chi ADMIN.
-- Khong dung service_role trong trinh duyet.
CREATE OR REPLACE FUNCTION public.v10_auto_assign(p_employee_count integer, p_threshold numeric DEFAULT 300000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN required'; END IF;
 IF p_employee_count NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'Employee count 1..999'; END IF;
 IF p_threshold IS NULL OR p_threshold < 0 THEN RAISE EXCEPTION 'Invalid discrepancy threshold'; END IF;
 PERFORM pg_advisory_xact_lock(734011);
 WITH ranked AS (
   SELECT d.ma_sp, row_number() OVER (ORDER BY d.nganh_hang COLLATE "C" NULLS LAST,d.ten_sp COLLATE "C" NULLS LAST,d.ma_sp) AS rn
   FROM (SELECT DISTINCT ON (ma_sp) ma_sp, nganh_hang, ten_sp, gt_chenh_lech FROM public.dscl ORDER BY ma_sp, id DESC) d
   LEFT JOIN public.phan_cong p ON p.ma_sp=d.ma_sp
   WHERE ABS(COALESCE(d.gt_chenh_lech,0)) >= p_threshold
     AND COALESCE(p.trang_thai,'Chưa kiểm') <> 'Đã kiểm'
 ), incoming AS (
   SELECT ma_sp, lpad((((rn-1)*p_employee_count / GREATEST((SELECT count(*) FROM ranked),1)) + 1)::text,3,'0') AS mnv
   FROM ranked
 )
 INSERT INTO public.phan_cong(ma_sp,mnv,trang_thai,ngay_phan_cong)
 SELECT ma_sp,mnv,'Chưa kiểm',now() FROM incoming
 ON CONFLICT(ma_sp) DO UPDATE SET mnv=excluded.mnv,ngay_phan_cong=excluded.ngay_phan_cong,updated_at=now()
 WHERE public.phan_cong.trang_thai <> 'Đã kiểm';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('assigned',n,'employee_count',p_employee_count,'threshold',p_threshold);
END $$;
CREATE OR REPLACE FUNCTION public.v10_import_assign(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN required'; END IF;
 IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows)>20000 THEN RAISE EXCEPTION 'Invalid rows'; END IF;
 PERFORM pg_advisory_xact_lock(734011);
 IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(ma_sp text,mnv text) GROUP BY ma_sp HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate product'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(ma_sp text,mnv text) WHERE NOT EXISTS (SELECT 1 FROM public.dscl d WHERE d.ma_sp=x.ma_sp)) THEN RAISE EXCEPTION 'Unknown product'; END IF;
 INSERT INTO public.phan_cong(ma_sp,mnv,trang_thai,ngay_phan_cong)
 SELECT x.ma_sp,x.mnv,'Chưa kiểm',now() FROM jsonb_to_recordset(p_rows) AS x(ma_sp text,mnv text)
 WHERE x.ma_sp IS NOT NULL AND x.mnv IS NOT NULL AND btrim(x.mnv)<>''
 ON CONFLICT(ma_sp) DO UPDATE SET mnv=excluded.mnv,ngay_phan_cong=excluded.ngay_phan_cong,updated_at=now()
 WHERE public.phan_cong.trang_thai <> 'Đã kiểm';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('imported',n);
END $$;
REVOKE ALL ON FUNCTION public.v10_auto_assign(integer,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v10_import_assign(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v10_auto_assign(integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v10_import_assign(jsonb) TO authenticated;

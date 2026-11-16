-- Chạy MỘT LẦN trong Supabase SQL Editor, sau khi sao lưu database.
-- Không xóa trực tiếp các bảng PHAN_CONG, DIEU_CHINH, FINAL_LINES, USERS.
CREATE TABLE IF NOT EXISTS public.v10_upload_stage (
  batch_id uuid NOT NULL,
  table_name text NOT NULL,
  row_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS v10_upload_stage_batch_idx ON public.v10_upload_stage(batch_id,table_name);
ALTER TABLE public.v10_upload_stage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v10_upload_stage FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.v10_stage_upload(p_batch uuid,p_table text,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND upper(vai_tro)='ADMIN') THEN
   RAISE EXCEPTION 'Admin required';
 END IF;
 IF p_table NOT IN ('dscl','ct_kv','bc') THEN RAISE EXCEPTION 'Invalid table'; END IF;
 IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Invalid chunk'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) v WHERE nullif(trim(v->>'ma_sp'),'') IS NULL) THEN
   RAISE EXCEPTION 'Missing ma_sp';
 END IF;
 INSERT INTO public.v10_upload_stage(batch_id,table_name,row_data)
 SELECT p_batch,p_table,value FROM jsonb_array_elements(p_rows);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.v10_commit_upload(p_batch uuid,p_table text,p_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer; distinct_n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND upper(vai_tro)='ADMIN') THEN
   RAISE EXCEPTION 'Admin required';
 END IF;
 IF p_table NOT IN ('dscl','ct_kv','bc') OR p_expected < 1 OR p_expected > 100000 THEN RAISE EXCEPTION 'Invalid input'; END IF;
 -- Chặn hai lần commit đồng thời cùng bảng.
 PERFORM pg_advisory_xact_lock(hashtext('v10_upload_'||p_table));
 SELECT count(*) INTO n FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table;
 IF n<>p_expected THEN RAISE EXCEPTION 'Expected %, staged %',p_expected,n; END IF;
 IF p_table='dscl' THEN
   SELECT count(DISTINCT row_data->>'ma_sp') INTO distinct_n FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table;
   IF distinct_n<>n THEN RAISE EXCEPTION 'Duplicate ma_sp in DSCL'; END IF;
   -- Giữ ID mã cũ, cập nhật toàn bộ trường dữ liệu.
   UPDATE public.dscl d SET
     ten_sp=s.ten_sp,nganh_hang=s.nganh_hang,nhom_vat_tu=s.nhom_vat_tu,
     dvt_co_ban=s.dvt_co_ban,sl_so=s.sl_so,gt_chenh_lech=s.gt_chenh_lech
   FROM (SELECT * FROM jsonb_to_recordset((SELECT jsonb_agg(row_data) FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table))
      AS x(ma_sp text,ten_sp text,nganh_hang text,nhom_vat_tu text,dvt_co_ban text,sl_so numeric,gt_chenh_lech numeric)) s
   WHERE d.ma_sp=s.ma_sp;
   DELETE FROM public.dscl d WHERE NOT EXISTS (
     SELECT 1 FROM public.v10_upload_stage st WHERE st.batch_id=p_batch AND st.table_name=p_table AND st.row_data->>'ma_sp'=d.ma_sp);
   INSERT INTO public.dscl(ma_sp,ten_sp,nganh_hang,nhom_vat_tu,dvt_co_ban,sl_so,gt_chenh_lech)
   SELECT s.ma_sp,s.ten_sp,s.nganh_hang,s.nhom_vat_tu,s.dvt_co_ban,s.sl_so,s.gt_chenh_lech
   FROM jsonb_to_recordset((SELECT jsonb_agg(row_data) FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table))
   AS s(ma_sp text,ten_sp text,nganh_hang text,nhom_vat_tu text,dvt_co_ban text,sl_so numeric,gt_chenh_lech numeric)
   WHERE NOT EXISTS (SELECT 1 FROM public.dscl d WHERE d.ma_sp=s.ma_sp);
 ELSIF p_table='ct_kv' THEN
   DELETE FROM public.ct_kv;
   INSERT INTO public.ct_kv(ma_sp,barcode,ten_sp,khu_vuc,dvt_nhap,sl_nhap,sl_dem,sl_so)
   SELECT ma_sp,barcode,ten_sp,khu_vuc,dvt_nhap,sl_nhap,sl_dem,sl_so
   FROM jsonb_to_recordset((SELECT jsonb_agg(row_data) FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table))
   AS x(ma_sp text,barcode text,ten_sp text,khu_vuc text,dvt_nhap text,sl_nhap numeric,sl_dem numeric,sl_so numeric);
 ELSE
   DELETE FROM public.bc;
   INSERT INTO public.bc(ma_sp,barcode,ten_sp,khu_vuc,dvt_co_ban,sl_dem)
   SELECT ma_sp,barcode,ten_sp,khu_vuc,dvt_co_ban,sl_dem
   FROM jsonb_to_recordset((SELECT jsonb_agg(row_data) FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table))
   AS x(ma_sp text,barcode text,ten_sp text,khu_vuc text,dvt_co_ban text,sl_dem numeric);
 END IF;
 EXECUTE format('SELECT count(*) FROM public.%I',p_table) INTO distinct_n;
 IF distinct_n<>n THEN RAISE EXCEPTION 'Count mismatch after replacement: % vs %',distinct_n,n; END IF;
 DELETE FROM public.v10_upload_stage WHERE batch_id=p_batch AND table_name=p_table;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.v10_stage_upload(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.v10_commit_upload(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v10_stage_upload(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v10_commit_upload(uuid,text,integer) TO authenticated;

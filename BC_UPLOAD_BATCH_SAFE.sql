-- Chạy trong Supabase SQL Editor trước khi deploy bản sửa.
-- BC staging riêng, không ảnh hưởng bảng bc đang sử dụng.
CREATE TABLE IF NOT EXISTS public.v10_bc_upload_stage (
  upload_id uuid NOT NULL,
  row_no integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(upload_id,row_no)
);
REVOKE ALL ON public.v10_bc_upload_stage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.v10_bc_stage_batch(p_upload_id uuid,p_offset integer,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND upper(vai_tro)='ADMIN') THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF p_upload_id IS NULL OR p_offset < 0 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 n:=jsonb_array_length(p_rows);
 IF n NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Batch size must be 1..5000'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) AS x(v) WHERE nullif(trim(v->>'ma_sp'),'') IS NULL OR nullif(trim(v->>'barcode'),'') IS NULL) THEN RAISE EXCEPTION 'Missing ma_sp/barcode'; END IF;
 INSERT INTO public.v10_bc_upload_stage(upload_id,row_no,payload)
 SELECT p_upload_id,p_offset+ord::integer-1,val FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(val,ord)
 ON CONFLICT(upload_id,row_no) DO UPDATE SET payload=excluded.payload;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.v10_bc_finalize(p_upload_id uuid,p_expected integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer; inserted integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND upper(vai_tro)='ADMIN') THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF p_expected NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid expected count'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('v10_replace_bc'));
 SELECT count(*) INTO n FROM public.v10_bc_upload_stage WHERE upload_id=p_upload_id;
 IF n<>p_expected OR (SELECT min(row_no) FROM public.v10_bc_upload_stage WHERE upload_id=p_upload_id)<>0 OR (SELECT max(row_no) FROM public.v10_bc_upload_stage WHERE upload_id=p_upload_id)<>p_expected-1 THEN RAISE EXCEPTION 'Incomplete upload: %/%',n,p_expected; END IF;
 -- DELETE + INSERT atomic. Nếu final lỗi, dữ liệu BC cũ rollback.
 DELETE FROM public.bc;
 INSERT INTO public.bc(ma_sp,barcode,ten_sp,khu_vuc,dvt_co_ban,sl_dem)
 SELECT p.payload->>'ma_sp',p.payload->>'barcode',p.payload->>'ten_sp',p.payload->>'khu_vuc',p.payload->>'dvt_co_ban',coalesce(nullif(p.payload->>'sl_dem','')::numeric,0)
 FROM public.v10_bc_upload_stage p WHERE p.upload_id=p_upload_id ORDER BY p.row_no;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted<>p_expected THEN RAISE EXCEPTION 'Inserted % vs expected %',inserted,p_expected; END IF;
 DELETE FROM public.v10_bc_upload_stage WHERE upload_id=p_upload_id;
 RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.v10_bc_discard(p_upload_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND upper(vai_tro)='ADMIN') THEN RAISE EXCEPTION 'Admin required'; END IF;
 DELETE FROM public.v10_bc_upload_stage WHERE upload_id=p_upload_id;
END $$;
REVOKE ALL ON FUNCTION public.v10_bc_stage_batch(uuid,integer,jsonb),public.v10_bc_finalize(uuid,integer),public.v10_bc_discard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v10_bc_stage_batch(uuid,integer,jsonb),public.v10_bc_finalize(uuid,integer),public.v10_bc_discard(uuid) TO authenticated;

-- Run in Supabase SQL Editor as database owner. Back up final_lines first.
-- Keeps CT_KV and DSCL unchanged; only writes final_lines.
CREATE SEQUENCE IF NOT EXISTS public.v10_final_line_id_seq;
SELECT setval('public.v10_final_line_id_seq', GREATEST(COALESCE((SELECT max(id) FROM public.final_lines),0),1), true);
ALTER TABLE public.final_lines ALTER COLUMN id SET DEFAULT nextval('public.v10_final_line_id_seq');

CREATE OR REPLACE FUNCTION public.v10_sync_final_product(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 p record;
 v_delta numeric := 0;
 v_new numeric;
 v_diff numeric;
 v_value numeric;
 v_mnv text;
 v_status text;
BEGIN
 IF nullif(btrim(p_code),'') IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('v10-final:'||p_code));
 SELECT * INTO p FROM public.dscl WHERE btrim(ma_sp)=btrim(p_code) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'DSCL missing for %',p_code; END IF;
 -- Last correction for each original CT_KV line; compare against immutable CT_KV original.
 SELECT COALESCE(sum(x.sl_moi-COALESCE(k.sl_dem,x.sl_cu,0)),0) INTO v_delta
 FROM (
  SELECT DISTINCT ON (ct_kv_id) ct_kv_id, sl_moi, sl_cu
  FROM public.dieu_chinh
  WHERE btrim(ma_sp)=btrim(p_code) AND ct_kv_id IS NOT NULL
   AND COALESCE(upper(btrim(trang_thai_duyet)),'') NOT IN ('TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT')
  ORDER BY ct_kv_id,created_at DESC NULLS LAST,id DESC
 ) x LEFT JOIN public.ct_kv k ON k.id=x.ct_kv_id;
 -- Each added KV is its own correction row; edits update that row.
 SELECT v_delta+COALESCE(sum(sl_moi),0) INTO v_delta
 FROM public.dieu_chinh
 WHERE btrim(ma_sp)=btrim(p_code) AND ct_kv_id IS NULL AND loai_dieu_chinh='THEM_KV'
 AND COALESCE(upper(btrim(trang_thai_duyet)),'') NOT IN ('TU_CHOI','TỪ CHỐI','CHO_DUYET','CHỜ DUYỆT');
 -- Always replace the product snapshot. Zero delta removes it from Final.
 DELETE FROM public.final_lines WHERE btrim(ma_sp)=btrim(p_code);
 IF abs(v_delta)<0.000000001 THEN RETURN; END IF;
 v_new:=COALESCE(p.sl_dem,0)+v_delta;
 v_diff:=v_new-COALESCE(p.sl_so,0);
 v_value:=CASE WHEN COALESCE(p.sl_dem,0)<>COALESCE(p.sl_so,0)
  THEN v_diff*COALESCE(p.gt_chenh_lech,0)/(COALESCE(p.sl_dem,0)-COALESCE(p.sl_so,0))
  ELSE NULL END;
 SELECT mnv,trang_thai INTO v_mnv,v_status FROM public.phan_cong WHERE btrim(ma_sp)=btrim(p_code) LIMIT 1;
 INSERT INTO public.final_lines(ma_sp,ten_sp,dvt_co_ban,sl_so,sl_dem,chenh_lech,gt_chenh_lech,nhom_vat_tu,mnv,trang_thai,qr_content,du_lieu_goc,updated_at)
 VALUES(p_code,p.ten_sp,p.dvt_co_ban,p.sl_so,v_new,v_diff,v_value,p.nhom_vat_tu,v_mnv,COALESCE(v_status,'Chưa kiểm'),p_code,
 jsonb_build_object('sl_dem_goc',p.sl_dem,'delta',v_delta,'nguon','dieu_chinh'),now());
END $$;

CREATE OR REPLACE FUNCTION public.v10_final_correction_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM public.v10_sync_final_product(OLD.ma_sp);
 ELSE
  PERFORM public.v10_sync_final_product(NEW.ma_sp);
  IF TG_OP='UPDATE' AND OLD.ma_sp IS DISTINCT FROM NEW.ma_sp THEN
   PERFORM public.v10_sync_final_product(OLD.ma_sp);
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v10_final_on_correction ON public.dieu_chinh;
CREATE TRIGGER v10_final_on_correction AFTER INSERT OR UPDATE OR DELETE ON public.dieu_chinh
FOR EACH ROW EXECUTE FUNCTION public.v10_final_correction_trigger();
-- Populate existing changes, including the three known test codes.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT ma_sp FROM public.dieu_chinh LOOP
  PERFORM public.v10_sync_final_product(r.ma_sp);
 END LOOP;
END $$;
-- Verification
SELECT ma_sp,sl_dem,chenh_lech,du_lieu_goc->>'delta' AS delta
FROM public.final_lines WHERE ma_sp IN ('10005170','10005201','10141959');

-- V10: run ONCE in Supabase SQL Editor as postgres / database owner.
-- Does not delete DSCL, CT_KV, BC, PHAN_CONG, or correction history.
-- Reinstalls final synchronization trigger and Admin RPC functions.

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

-- Explicit refresh for Admin edits from Danh sach ma hang.
CREATE OR REPLACE FUNCTION public.v10_admin_refresh_final(p_ma_sp text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.users WHERE id=auth.uid()
  AND upper(btrim(vai_tro))='ADMIN' AND dang_hoat_dong=true
 ) THEN RAISE EXCEPTION 'Chi Admin duoc dong bo Final'; END IF;
 PERFORM public.v10_sync_final_product(p_ma_sp);
END $$;
REVOKE ALL ON FUNCTION public.v10_admin_refresh_final(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v10_admin_refresh_final(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v10_admin_set_final_qty(p_ma_sp text,p_sl_moi numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_uid uuid:=auth.uid();
 v_current numeric;
 v_mnv text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.users WHERE id=v_uid AND upper(btrim(vai_tro))='ADMIN' AND dang_hoat_dong=true
 ) THEN RAISE EXCEPTION 'Chi Admin duoc sua SL tai Final'; END IF;
 IF p_sl_moi IS NULL OR p_sl_moi<0 THEN RAISE EXCEPTION 'SL phai >= 0'; END IF;
 IF NULLIF(btrim(p_ma_sp),'') IS NULL THEN RAISE EXCEPTION 'Thieu ma SP'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('v10-final:'||p_ma_sp));
 SELECT sl_dem INTO v_current FROM public.final_lines WHERE btrim(ma_sp)=btrim(p_ma_sp) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ma SP chua co trong Final'; END IF;
 IF v_current=p_sl_moi THEN RETURN; END IF;
 SELECT mnv INTO v_mnv FROM public.users WHERE id=v_uid LIMIT 1;
 -- Append each change; the existing final trigger sums all added-area deltas.
 -- This preserves every Admin correction as a separate audit row.
 INSERT INTO public.dieu_chinh(ma_sp,ct_kv_id,loai_dieu_chinh,khu_vuc_cu,khu_vuc_moi,
  sl_cu,sl_moi,sl_chenh_lech,mnv,nguoi_cap_nhat,ghi_chu,trang_thai_duyet)
 VALUES(p_ma_sp,NULL,'THEM_KV',NULL,'ADMIN_FINAL_ADJUSTMENT',
  v_current,p_sl_moi-v_current,p_sl_moi-v_current,
  COALESCE(v_mnv,'ADMIN'),COALESCE(v_mnv,'ADMIN'),'ADMIN_FINAL_ADJUSTMENT','Không cần duyệt');
END $$;
REVOKE ALL ON FUNCTION public.v10_admin_set_final_qty(text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v10_admin_set_final_qty(text,numeric) TO authenticated;

-- NOTE: ADMIN_FINAL_ADJUSTMENT is a signed quantity delta, not a CT_KV row.
-- This append-only record preserves the history and the trigger rebuilds Final.

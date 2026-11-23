-- CHAY MOT LAN trong Supabase SQL Editor (role postgres).
-- Admin thay doi SL Final => ghi DIEU_CHINH; trigger hien co cap nhat FINAL.
-- KHONG xoa du lieu cu; lich su van duoc giu.
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

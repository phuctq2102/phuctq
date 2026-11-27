BEGIN;

CREATE TABLE IF NOT EXISTS public.v10_nganh_hang (
  ma_nhom text PRIMARY KEY CHECK (ma_nhom ~ '^[0-9]{5}$'),
  ten_nganh text NOT NULL CHECK (length(btrim(ten_nganh)) BETWEEN 1 AND 200)
);

ALTER TABLE public.v10_nganh_hang ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v10_nganh_hang FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.v10_nganh_hang TO authenticated;

DROP POLICY IF EXISTS v10_nganh_hang_read ON public.v10_nganh_hang;
CREATE POLICY v10_nganh_hang_read ON public.v10_nganh_hang
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS v10_nganh_hang_insert ON public.v10_nganh_hang;
CREATE POLICY v10_nganh_hang_insert ON public.v10_nganh_hang
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS v10_nganh_hang_update ON public.v10_nganh_hang;
CREATE POLICY v10_nganh_hang_update ON public.v10_nganh_hang
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;

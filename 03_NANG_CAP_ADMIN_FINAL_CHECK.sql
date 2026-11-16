-- Chay mot lan: tuong thich voi bang admin_final_check da tao truoc do.
CREATE TABLE IF NOT EXISTS public.admin_final_check (
 ma_sp text PRIMARY KEY
);
ALTER TABLE public.admin_final_check ADD COLUMN IF NOT EXISTS revision text;
ALTER TABLE public.admin_final_check ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT now();
ALTER TABLE public.admin_final_check ADD COLUMN IF NOT EXISTS confirmed_by uuid;
ALTER TABLE public.admin_final_check ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.admin_final_check TO authenticated;
DROP POLICY IF EXISTS admin_final_check_admin ON public.admin_final_check;
DROP POLICY IF EXISTS admin_final_check_select ON public.admin_final_check;
DROP POLICY IF EXISTS admin_final_check_insert ON public.admin_final_check;
DROP POLICY IF EXISTS admin_final_check_update ON public.admin_final_check;
CREATE POLICY admin_final_check_select ON public.admin_final_check FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY admin_final_check_insert ON public.admin_final_check FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()) AND confirmed_by=auth.uid());
CREATE POLICY admin_final_check_update ON public.admin_final_check FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()) AND confirmed_by=auth.uid());
NOTIFY pgrst, 'reload schema';

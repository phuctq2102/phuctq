CREATE OR REPLACE FUNCTION public.v10_replace_direct(p_table text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    n integer;
    inserted integer;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = auth.uid()
          AND upper(vai_tro) = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'Admin required';
    END IF;

    IF p_table NOT IN ('dscl', 'ct_kv', 'bc') THEN
        RAISE EXCEPTION 'Invalid table';
    END IF;

    IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Expected JSON array';
    END IF;

    n := jsonb_array_length(p_rows);

    IF n NOT BETWEEN 1 AND 100000 THEN
        RAISE EXCEPTION 'Invalid row count: %', n;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_rows) AS e(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
           OR nullif(trim(value->>'ma_sp'), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Invalid JSON row or missing ma_sp';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('v10_replace_' || p_table)
    );

    IF p_table = 'dscl' THEN

        -- Không cho phép thiếu SL đếm
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_rows) AS e(value)
            WHERE NOT (value ? 'sl_dem')
               OR value->>'sl_dem' IS NULL
               OR jsonb_typeof(value->'sl_dem') = 'null'
        ) THEN
            RAISE EXCEPTION 'DSCL missing sl_dem';
        END IF;

        IF (
            SELECT count(DISTINCT value->>'ma_sp')
            FROM jsonb_array_elements(p_rows) AS e(value)
        ) <> n THEN
            RAISE EXCEPTION 'DSCL has duplicate ma_sp';
        END IF;

        DELETE FROM public.dscl
        WHERE ma_sp IS NOT NULL;

        INSERT INTO public.dscl (
            ma_sp,
            ten_sp,
            nganh_hang,
            nhom_vat_tu,
            dvt_co_ban,
            sl_so,
            sl_dem,
            gt_chenh_lech
        )
        SELECT
            ma_sp,
            ten_sp,
            nganh_hang,
            nhom_vat_tu,
            dvt_co_ban,
            coalesce(sl_so, 0),
            sl_dem,
            coalesce(gt_chenh_lech, 0)
        FROM jsonb_to_recordset(p_rows) AS x(
            ma_sp text,
            ten_sp text,
            nganh_hang text,
            nhom_vat_tu text,
            dvt_co_ban text,
            sl_so numeric,
            sl_dem numeric,
            gt_chenh_lech numeric
        );

    ELSIF p_table = 'ct_kv' THEN

        DELETE FROM public.ct_kv
        WHERE id IS NOT NULL;

        INSERT INTO public.ct_kv (
            ma_sp,
            barcode,
            ten_sp,
            khu_vuc,
            dvt_nhap,
            sl_nhap,
            sl_dem,
            sl_so,
            du_lieu_goc
        )
        SELECT
            ma_sp,
            barcode,
            ten_sp,
            khu_vuc,
            dvt_nhap,
            coalesce(sl_nhap, 0),
            coalesce(sl_dem, 0),
            coalesce(sl_so, 0),
            to_jsonb(x)
        FROM jsonb_to_recordset(p_rows) AS x(
            ma_sp text,
            barcode text,
            ten_sp text,
            khu_vuc text,
            dvt_nhap text,
            sl_nhap numeric,
            sl_dem numeric,
            sl_so numeric,
            round1_at timestamptz,
            round2_at timestamptz,
            nguoi_cap_nhat text,
            nguoi_cap_nhat_round2 text
        );

    ELSE

        DELETE FROM public.bc
        WHERE ma_sp IS NOT NULL;

        INSERT INTO public.bc (
            ma_sp,
            barcode,
            ten_sp,
            khu_vuc,
            dvt_co_ban,
            sl_dem
        )
        SELECT
            ma_sp,
            barcode,
            ten_sp,
            khu_vuc,
            dvt_co_ban,
            coalesce(sl_dem, 0)
        FROM jsonb_to_recordset(p_rows) AS x(
            ma_sp text,
            barcode text,
            ten_sp text,
            khu_vuc text,
            dvt_co_ban text,
            sl_dem numeric
        );

    END IF;

    GET DIAGNOSTICS inserted = ROW_COUNT;

    IF inserted <> n THEN
        RAISE EXCEPTION
            'Count mismatch: expected %, inserted %',
            n, inserted;
    END IF;

    RETURN inserted;
END;
$function$
;

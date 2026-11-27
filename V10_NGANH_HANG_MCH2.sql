ALTER TABLE public.v10_nganh_hang
  ADD COLUMN IF NOT EXISTS ma_mch2 text,
  ADD COLUMN IF NOT EXISTS ten_mch2 text;

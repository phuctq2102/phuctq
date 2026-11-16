-- Chạy trong Supabase SQL Editor một lần, trước khi upload lại DSCL.
-- Không xóa dữ liệu hiện có.
ALTER TABLE public.dscl ADD COLUMN IF NOT EXISTS sl_dem numeric DEFAULT 0;
-- Sau đó chạy lại SUPABASE_REPLACE_DIRECT.sql để cập nhật RPC đọc cột sl_dem.

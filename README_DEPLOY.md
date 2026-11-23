# V10 React + Supabase — bản đầy đủ

Đã tích hợp FinalView_FIXED.jsx thành src/FinalView.jsx. Final tải trực tiếp final_lines trước, chỉ hiện dòng có du_lieu_goc.delta khác 0; các dữ liệu bổ sung tải sau.

## Triển khai
1. Upload **nội dung bên trong thư mục phuctq-main** lên root repository GitHub (package.json và index.html phải ở root).
2. Trong Vercel: Framework Preset = Vite, Build Command = npm run build, Output Directory = dist.
3. Environment Variables: VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY (giữ giá trị public/publishable hiện đang dùng trong Vercel). Không đưa service_role/secret key vào frontend.
4. Redeploy và hard-refresh. Mở Final, xem dòng 'Kiểm tra nguồn'.

Lưu ý: file ZIP đầu vào thiếu index.html; đã bổ sung entry HTML chuẩn Vite. Chưa kiểm thử trực tiếp trên Supabase của bạn. Không thay đổi schema SQL.

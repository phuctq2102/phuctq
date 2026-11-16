# V10 - Đăng nhập bằng MNV + mật khẩu

## Thay đổi
- Form đăng nhập chỉ nhập MNV (001, 002, ...) và mật khẩu, không hiển thị email.
- Edge Function `mnv-login` tra cứu tài khoản Supabase Auth qua `public.users.mnv` rồi xác thực mật khẩu bằng Supabase Auth.
- Giữ nguyên tài khoản hiện tại, kể cả MNV 001 đang dùng email Gmail; không đổi/xóa email trong Auth.
- Quản lý/tạo tài khoản hàng loạt vẫn dùng Edge Function `manage-mnv` như bản trước.

## Bắt buộc triển khai Edge Function mới
1. Vào Supabase > Edge Functions > Deploy a new function > Via Editor.
2. Tên chính xác: `mnv-login`.
3. Thay toàn bộ nội dung `index.ts` bằng file `supabase/functions/mnv-login/index.ts` trong ZIP và Deploy.
4. **Tắt Verify JWT cho riêng function `mnv-login`** (vì đây là endpoint đăng nhập trước khi có access token). Không tắt Verify JWT của các function khác. Function này vẫn xác thực mật khẩu bằng Supabase Auth và không cấp quyền nếu không đúng.
5. Chạy ứng dụng và thử MNV 001, 002 với mật khẩu đã tạo. Không cần thay đổi SQL hoặc tạo lại tài khoản.

## An toàn triển khai
- Chỉ triển khai trên HTTPS khi đưa vào sử dụng chính thức.
- Nên giới hạn tốc độ truy cập / chống brute force ở lớp gateway/edge trước khi public; endpoint đăng nhập có thể bị thử mật khẩu liên tục nếu không giới hạn.
- Không đặt `SUPABASE_SERVICE_ROLE_KEY` trong React hay `.env` của Vite. Supabase cung cấp secret này cho Edge Function ở server.
- Thử nghiệm trên môi trường staging trước. Các chức năng kiểm đếm/Final khác chưa được xác nhận hoàn chỉnh.

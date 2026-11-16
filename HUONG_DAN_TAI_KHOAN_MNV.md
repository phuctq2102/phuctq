# Tích hợp tài khoản MNV (React + Supabase)

## Triển khai bắt buộc

1. Sao lưu dữ liệu Supabase. Đảm bảo `public.users` có `id uuid` liên kết `auth.users`, `mnv text UNIQUE`, `ho_ten`, `vai_tro`, `dang_hoat_dong` như cấu trúc đã cung cấp.
2. Cài Supabase CLI và đăng nhập: `npx supabase login`.
3. Liên kết project: `npx supabase link --project-ref <PROJECT_REF>` (thay đúng project ref).
4. Deploy Edge Function: `npx supabase functions deploy manage-mnv`.
5. Supabase Dashboard > Edge Functions > manage-mnv: xác nhận JWT verification **bật**. Đảm bảo server có `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase thường tự cung cấp cho Edge Functions; kiểm tra cấu hình). Không đặt service role trong Vite hoặc trình duyệt.
6. Trong thư mục React: `npm install`, `npm run dev`.
7. Đăng nhập tài khoản ADMIN đã có trong Supabase Auth + `public.users`. Vào menu **Tài khoản**, tạo một MNV thử, sau đó đăng xuất và đăng nhập bằng `001` + mật khẩu thử.
8. Tải mẫu Excel, nhập mật khẩu riêng tối thiểu 8 ký tự cho từng MNV, upload, xem trước, xác nhận và tải báo cáo kết quả.

## Bảo mật và lưu ý

- Tài khoản MNV sử dụng email kỹ thuật nội bộ `mnv-001@staff.example.com` để tương thích `signInWithPassword`. Đây **không phải email nhận thư**. Nếu dự án đã có MNV sử dụng email thật, cần chuyển đổi hoặc thêm cơ chế ánh xạ trước khi sử dụng đăng nhập bằng mã.
- Không chia sẻ file Excel có mật khẩu; xóa sau khi hoàn tất. Không ghi mật khẩu vào bảng `public.users`.
- Chức năng tạo ADMIN qua Excel bị chặn để tránh leo thang quyền. ADMIN hiện có được tạo/cấp quyền riêng.
- Chức năng khóa tài khoản dùng Supabase Auth ban + cập nhật `public.users`; nếu cập nhật hồ sơ lỗi sau khi Auth thành công, Admin cần thử lại hoặc kiểm tra trạng thái.
- Việc tạo tài khoản và đăng nhập KHÔNG tự cấp RLS cho nhân viên xem DSCL/CT_KV/BC hoặc quyền ghi DIEU_CHINH. Các nghiệp vụ kiểm đếm vẫn cần RPC phân quyền riêng.
- Các tính năng khác trong ZIP kế thừa từ bản trước, chưa được kiểm thử end-to-end với database production. Không dùng production trước khi kiểm thử.

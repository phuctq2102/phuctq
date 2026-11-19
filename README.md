# Web App V10 React + Supabase — bản khởi tạo 0.1

## Trạng thái
Đây là **bản khởi tạo để kiểm tra kết nối và giao diện**, **chưa phải bản chuyển đổi đầy đủ V10 Fast**. Không triển khai thay thế hệ thống đang hoạt động.

### Đã có
- React/Vite và Supabase JS, Supabase Auth (email/password).
- Đọc vai trò từ `public.users` dựa trên UUID Auth.
- Điều hướng Admin qua 10 bảng Supabase; nhân viên xem phân công, điều chỉnh, đếm thêm theo RLS hiện có.
- Bảng dữ liệu, tìm kiếm trên dữ liệu đã tải, phân trang 50 dòng, xem chi tiết.
- Đọc Supabase theo các lô 500 dòng để vượt giới hạn truy vấn thông thường (nhưng chưa phải phân trang server-side tối ưu).
- Form thử gửi đề xuất điều chỉnh vào `dieu_chinh` (chỉ hoạt động khi RLS cho phép; **chưa đồng bộ vào Final**).

### Chưa có / chưa tương đương V10 Fast
- Upload Excel DSCL/CT_KV/BC thay thế an toàn và xác thực quyền Admin ở backend.
- Phân công tự động, import/export phân công, giữ nguyên mã đã kiểm.
- Quy trình nhân viên sửa KV, thêm KV, duyệt, đồng bộ số lượng thực tế.
- Sinh Final, QR, xuất Excel/ZIP, logic ghép BC khi SL đếm = 0.
- Audit đầy đủ, chính sách RLS cho tất cả thao tác ghi, RPC bảo vệ cập nhật theo giao dịch.
- Kiểm thử dữ liệu thật, tối ưu tải 5k–10k dòng và xác nhận mục tiêu 1–2 giây.

## Chạy trên máy Windows
1. Cài Node.js LTS (nếu chưa có).
2. Giải nén, mở Terminal tại thư mục chứa `package.json`.
3. Chạy `npm install`.
4. Sao chép `.env.example` thành `.env.local`; điền **publishable key** từ Supabase Dashboard vào `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Chạy `npm run dev` và mở URL Vite hiển thị.
6. Đăng nhập bằng tài khoản Supabase Auth đã được liên kết `public.users.id`.

**Bảo mật:** Không đặt `service_role`/secret key vào `.env.local` có tiền tố `VITE_`. Publishable key dùng với RLS. Trước khi triển khai, kiểm tra RLS và quyền theo từng vai trò.

## Dữ liệu nguồn
Đối chiếu theo các CSV cấu trúc Supabase (10 bảng) và bản ZIP `WebApp_V10_Fast (1)(1).zip` người dùng cung cấp. Chưa sao chép các hàm Apps Script sang React vì logic server-side phải được thiết kế lại an toàn.

## Bổ sung Upload Excel (bản thử nghiệm an toàn)
- Admin có thể chọn file .xlsx/.xls, xem trước 5 dòng, sau đó xác nhận nhập DSCL, CT_KV, BC.
- **Chỉ nhập vào bảng trống**; tuyệt đối không xóa dữ liệu hoặc thay thế bảng có sẵn. Nếu lỗi giữa các lô, dữ liệu có thể đã nhập một phần; cần đối chiếu Supabase trước khi thử lại.
- Excel phải có hàng tiêu đề nhận diện được, tối thiểu `Mã SP` và một cột khác. Định dạng số nên là số Excel thông thường, không chứa dấu phân tách hàng nghìn tùy biến.
- Chưa có tính năng nhập thay thế theo giao dịch, khôi phục dữ liệu, hoặc chuyển đổi toàn bộ V10 Fast. Cần đối chiếu tên cột, ràng buộc và RLS thực tế trước khi nhập dữ liệu thật. Nếu tên cột khác hoặc thiếu trường bắt buộc, Supabase sẽ từ chối.
- Không đưa secret/service_role key vào frontend. Quyền ghi do Supabase RLS quyết định.


## Cập nhật giao diện Danh sách mã hàng
- Trang DSCL nay hiển thị danh sách đi kiểm: mã SP, tên SP, MNV, SL đếm, SL sổ, chênh lệch, trạng thái và nút Xem.
- Truy vấn DSCL theo trang 50 mã; khi bấm Xem mới tải CT_KV và BC cho mã đó. Barcode trống được bổ sung từ BC, nhiều mã nối bằng dấu chấm phẩy.
- Không ghi dữ liệu Supabase từ trang này. Giữ nguyên các trang khác và chế độ upload vào bảng trống.
- Chưa thể xác nhận mapping thực tế của các trường DSCL, cách tính GT chênh lệch, hoặc schema RLS. Chênh lệch hiển thị được tính từ SL đếm - SL sổ; GT chênh lệch lấy độ lớn từ trường hiện có và dấu theo số lượng, cần kiểm thử.
- Bộ lọc trạng thái chỉ lọc 50 mã đã tải. Ngưỡng GT chênh lệch áp dụng phía server, tìm kiếm mã/tên phía server.
- Chưa kiểm thử npm build do môi trường không cài được dependencies; chạy npm install và npm run build trên máy của bạn để kiểm tra.

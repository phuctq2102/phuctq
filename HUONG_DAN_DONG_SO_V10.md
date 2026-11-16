# V10 – Quản lý kỳ kiểm kê

## Bắt buộc trước khi dùng

1. **Sao lưu Supabase trước khi chạy SQL hoặc thao tác xóa.** Kiểm tra trên dự án thử nghiệm trước.
2. Vào Supabase > SQL Editor, chạy toàn bộ `04_QUAN_LY_KY_KIEM_KE.sql`. Script giả định bảng `dscl` có cột `nha_may`, `admin_final_check`, `final_lines`, `dem_them` tồn tại và hàm `public.is_admin()` đã hoạt động. Nếu tên cột/bảng khác, script sẽ lỗi và phải điều chỉnh theo schema thực tế.
3. Chạy React V10 như trước (`npm install`, `npm run dev`). Đăng nhập Admin, mở **Danh sách mã hàng**, thấy khối **Quản lý kỳ kiểm kê**.
4. Chỉ đóng sổ khi DSCL chứa đúng **một** mã cửa hàng tại cột `nha_may` và CT_KV đã upload đầy đủ.
5. Nút **Đóng sổ** lưu snapshot DSCL, CT_KV, DIEU_CHINH, FINAL tính toán và các bảng phụ; **không xóa** dữ liệu làm việc.
6. Nút **Bắt đầu kỳ mới** chỉ xóa dữ liệu làm việc sau khi xác nhận và kiểm tra bản lưu; BC, USERS, lịch sử đóng sổ giữ nguyên.
7. Nút **Xem lịch sử** liệt kê các kỳ đã đóng.

## Đồng bộ tự động Windows (không cần Python)

- Cần Windows PowerShell 5.1, **Microsoft Excel desktop**, ổ D:, Internet và tài khoản Supabase Auth Admin **email/password** có quyền RLS đọc lịch sử. Tài khoản MNV qua Edge Function không nhất thiết có mật khẩu email/password, nên **cấu hình này có thể không phù hợp hệ thống đăng nhập MNV hiện tại**.
- Trên máy Windows, mở PowerShell với tài khoản sẽ đồng bộ; chạy `windows-sync/CAU_HINH_DONG_BO.ps1`, nhập Supabase URL, publishable key, tài khoản Admin Auth. Mật khẩu được bảo vệ bằng Windows DPAPI theo user hiện tại.
- Task Scheduler chạy `V10_SYNC.ps1` khi đăng nhập Windows, tải các kỳ chưa có `SYNC_OK.txt` và xuất 4 file Excel theo `D:\KIEM_KE_V10\YYYY\MM\DD\CH_xxx\KY_UUID`.
- **Chỉ đánh dấu thành công tại máy**, không cập nhật trạng thái `sync_count` trên Supabase. Vì vậy giao diện lịch sử chưa phản ánh trạng thái đồng bộ thực tế. Không sử dụng Service Role Key trên máy Windows.
- Agent này chưa được thử với tài khoản Supabase và Excel trên máy thực tế. Tránh dùng với dữ liệu sản xuất trước khi kiểm tra trên bản sao.

## Giới hạn quan trọng

- Final tính toán từ `dieu_chinh` theo logic hiện có của `FinalView.jsx`; cần đối chiếu giá trị trước khi chốt.
- Việc đóng sổ không khóa mọi thao tác chỉnh sửa khác trong toàn ứng dụng; không để nhân viên cập nhật trong lúc đóng sổ hoặc bắt đầu kỳ mới.
- Các snapshot JSONB lớn có thể vượt giới hạn request hoặc dung lượng database. Cần kiểm thử tải thực tế 5.000–10.000 dòng.
- Nếu kỳ đã đóng và dữ liệu tiếp tục thay đổi, thao tác Bắt đầu kỳ mới sẽ từ chối xóa cho đến khi đóng sổ lại.

# Báo cáo CLKK V10 · Giai đoạn 1

Tab Admin **Báo cáo CLKK và Biên bản** nhận mã SAP từ DSCL đang làm việc. Khi chỉ có một mã SAP và một lịch khớp, app chọn lịch đó. Khi có nhiều kết quả, Admin chọn kỳ. Tab Final có nút mở báo cáo.

## Triển khai

1. Kiểm tra trên môi trường thử nghiệm có schema V10, gồm `dscl.ma_ch` và hàm `public.is_admin()`. Chạy `V10_BAO_CAO_CLKK.sql` một lần trước khi phát hành frontend.
2. Cài đúng phiên bản từ lockfile bằng `npm ci` rồi chạy `npm run build`. Dùng cấu hình Vercel hiện có.
3. Đăng nhập Admin. Nhập lịch Excel với các cột **Mã SAP**, **Ngày kiểm kê cũ**, **Ngày kiểm kê mới**. Các cột hành chính còn lại được giữ để hiển thị. Cần đối chiếu tên cột với mẫu lịch thực tế.
4. Nhập file SAP gốc bảy cột và xác nhận thay thế dữ liệu. Mỗi yêu cầu nhập chạy trong một giao dịch. Nếu file toàn hệ thống quá lớn, chia theo các nhóm cửa hàng/tháng hoàn chỉnh để nhập từng đợt. Mỗi nhóm phải chứa đủ dữ liệu tháng vì app thay thế nguyên nhóm.
5. Mở kỳ từ Final hoặc tab báo cáo. Đối chiếu tháng, MCH2, MCH3 rồi xuất Excel hoặc tạo nội dung email nháp.

Lịch trùng mã SAP và ngày mới cập nhật cùng một bản ghi. Đổi ngày kiểm kê mới tạo một lựa chọn lịch khác, cần xử lý lịch cũ theo quy trình nghiệp vụ khi mẫu lịch có định danh ổn định. Khi Admin xác nhận Reset trên bản mới, hệ thống xóa lịch kiểm kê, dữ liệu SAP, HCXL, nhân sự và lịch sử đóng sổ cùng dữ liệu làm việc. BC, tài khoản và cấu hình hệ thống vẫn dùng được sau Reset.

## Đối chiếu báo cáo

Kiểm tra kỳ bắt đầu ngày 01 của tháng sau kỳ cũ, doanh thu không Fresh và việc gom nhóm trước khi chuyển hóa chênh lệch. Với ngày D tạm bằng 0, đối chiếu từng chỉ tiêu với bộ số liệu đã xác nhận nội bộ. Cần xác nhận thời điểm cắt dữ liệu SAP tháng T trước khi chốt.

## Phạm vi tiếp theo

- Xác nhận công thức giá trị sau điều chỉnh Final, đối chiếu toàn bộ DSCL với điều chỉnh cuối và chọn quy tắc ghép tháng T với ngày D.
- Hoàn thiện lưu định mức và phần hàng tranh chấp.
- Nhận biểu mẫu Excel gốc BM8 và WMP BMBG để lập mapping, kiểm tra vùng in và xuất ZIP.
- Kiểm thử hồi quy V10 bằng tài khoản Admin và nhân viên trên môi trường thử nghiệm.

## File thay đổi

- `src/main.jsx` đăng ký tab và liên kết vào báo cáo từ Final.
- `src/ClkkReport.jsx` và `src/clkkReport.css` chứa giao diện, lọc đối chiếu, xuất Excel và nháp email.
- `src/clkkData.js` chuẩn hóa file nhập và tính các chỉ tiêu.
- `V10_BAO_CAO_CLKK.sql` tạo bảng, RLS và RPC tổng hợp MCH3.

## Nhập các file Excel thực tế

- Lịch kiểm kê nhận cột **Ngày kiểm kê trước** và **Lịch kiểm kê** có năm trong tiêu đề. Khi DSCL chưa có mã SAP, Admin chọn kỳ trong lịch để xem báo cáo SAP độc lập.
- GT_HCXL đọc số tiền có sẵn và điều kiện đổi trả. Chọn ngày kiểm kê cho từng mã cửa hàng trong file. Khi nhập lại cùng mã và ngày, app thay thế dữ liệu HCXL của kỳ đó.
- Danh mục nhân sự dùng ba cột **MNV**, **Tên NV**, **CH**. Nhập lại cập nhật theo CH và MNV. Danh mục này phục vụ báo cáo và biên bản, tách khỏi tài khoản đăng nhập.
- Cài thêm `V10_BAO_CAO_CLKK_DANH_MUC.sql` sau migration CLKK giai đoạn 1 để bật hai phần nhập mới. Cài `V10_RESET_GIU_BC.sql` sau RPC Reset gốc; SQL cài đặt chỉ đăng ký RPC có xác nhận, xóa dữ liệu diễn ra khi Admin thực hiện Reset.

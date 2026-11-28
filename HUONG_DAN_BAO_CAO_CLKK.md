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
- GT_HCXL là tùy chọn. Chỉ cần cột Mã CH và Thành tiền để tính tổng HCXL. App tra lịch theo từng mã cửa hàng trong file. Khi có một lịch khớp, app điền ngày tự động. Khi có nhiều lịch, Admin chọn kỳ. Có thể nhập riêng từng cửa hàng hoặc nhập chung các cửa hàng đã có kỳ. Các cửa hàng thiếu lịch vẫn còn trong bản xem trước khi nhập lịch bổ sung. Khi nhập lại cùng mã và ngày, app thay thế dữ liệu HCXL của kỳ đó.
- Danh mục nhân sự dùng ba cột **MNV**, **Tên NV**, **CH**. Nhập lại cập nhật theo CH và MNV. Danh mục này phục vụ báo cáo và biên bản, tách khỏi tài khoản đăng nhập.
- Cài thêm `V10_BAO_CAO_CLKK_DANH_MUC.sql` sau migration CLKK giai đoạn 1 để bật hai phần nhập mới. Cài `V10_RESET_GIU_BC.sql` sau RPC Reset gốc; SQL cài đặt chỉ đăng ký RPC có xác nhận, xóa dữ liệu diễn ra khi Admin thực hiện Reset.

## Đồng bộ thư mục Excel trên máy

1. Cài `V10_DONG_BO_THU_MUC.sql` sau các migration báo cáo và Reset. Migration này chỉ cài chức năng, việc xóa dữ liệu vẫn cần Admin xác nhận Reset trong ứng dụng.
2. Mở **Báo cáo CLKK và Biên bản** bằng Chrome hoặc Edge trên máy tính. Chọn **Chọn thư mục đồng bộ** rồi cấp quyền đọc thư mục Excel. Thư mục phải chứa file trực tiếp.
3. Dùng các tên **Lịch KK.xlsx**, **Up file trc và trong tháng KK.xlsx**, **HCXL.xlsx**, **DS nhan su.xlsx**. File cũng có thể dùng tên **Lịch kiểm kê**, **Doanh thu và CLKK SAP**, **GT_HCXL** hoặc **Danh mục nhân sự** với đuôi Excel tương ứng.
4. Giữ tab V10 mở. Dashboard tự tải lại sau khi có dữ liệu mới. HCXL tự lưu các cửa hàng có đúng một lịch. Nếu thiếu lịch, nhập lịch tương ứng. Nếu có nhiều kỳ, chọn kỳ trong luồng nhập HCXL.
5. Sau khi tải lại hoặc đóng tab, chọn lại thư mục để tiếp tục. Khi Reset, app dùng mốc trên Supabase để bỏ qua các file có thời điểm sửa trước Reset. Thay đổi nội dung hoặc thay bằng file mới cho kỳ tiếp theo.

Đồng bộ dùng phiên Admin đang đăng nhập và quyền đọc thư mục được trình duyệt cấp. Web không cần tài khoản Windows hay khóa Supabase quản trị.

Cài `V10_LICH_KK_NSO.sql` sau migration đồng bộ thư mục. Tự động nhập HCXL dựa trên mã SAP và ngày kiểm kê trong file lịch hiện tại của thư mục. Nếu mã không có trong file hoặc xuất hiện ở nhiều kỳ, app đưa mã đó vào danh sách cần kiểm tra. Có thể bỏ file HCXL khi kỳ không phát sinh HCXL. Ngày HSD được giữ theo dòng hàng. Lịch NSO hoặc mốc 00/00/1900 được lưu với ngày kỳ trước để trống. CLKK kỳ đầu dùng toàn bộ tháng SAP hiện có tới tháng kiểm kê. Cần cung cấp đủ số liệu kể từ khai trương để có kết quả toàn kỳ. Các dòng có mã placeholder Kho được bỏ qua.

Cài `V10_CLKK_NSO.sql` sau migration lịch NSO. Chế độ **Theo GĐV** dùng từng ngày kiểm kê để tách kỳ, lấy GĐV từ lịch và tính tỷ lệ bằng tổng CLKK chia tổng doanh thu của các cửa hàng có đủ dữ liệu. HCXL tùy chọn và phân nhóm theo số ngày còn lại đến HSD tại ngày kiểm kê.

Cài `V10_DASHBOARD_RECAP.sql` sau migration GĐV. Menu **Dashboard ngày D** mở giao diện chi tiết cửa hàng. **Dashboard All (RECAP)** đọc tất cả các kỳ đã có trong lịch và cho lọc tháng, GĐV hoặc QLKV. Mỗi nhóm và ngày kiểm kê có tổng riêng. Tổng HCXL lấy từ các cửa hàng đã có giá trị cho đúng kỳ; kỳ chưa có HCXL hiển thị **Chưa có**.

Cài `V10_DASHBOARD_DSCL.sql` để dùng **Nhập DSCL ngày D cho Dashboard**. File SAP DSCL có thể chứa nhiều mã trong cột Nhà máy. Chọn ngày kiểm kê dự kiến từ Lịch KK cho từng mã, sau đó bấm **Mở kỳ** trong RECAP để xem chi tiết. Lượt nhập này tạo dữ liệu báo cáo theo mã và ngày, tách khỏi DSCL làm việc của luồng kiểm đếm. Reset xóa DSCL báo cáo cùng lịch kiểm kê.

Cài `V10_DASHBOARD_XEP_HANG.sql` sau bảng DSCL báo cáo. **Dashboard Kiểm kê** có bốn phạm vi **1 CH**, **QLKV**, **GĐV**, **Toàn bộ**. Top CH được xếp theo từng kỳ và có thể đổi chỉ tiêu. Top mã hàng tổng hợp các kỳ có DSCL trong phạm vi đang lọc. Có thể chọn tối đa ba dòng kỳ để so sánh cạnh nhau.

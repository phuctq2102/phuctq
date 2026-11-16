# V10 – Đóng sổ và đồng bộ Windows (đặc tả triển khai)

**Trạng thái:** Chưa triển khai chức năng đóng sổ vào ứng dụng; đây là bản mã nguồn V10 hiện có kèm đặc tả. Không chạy SQL xóa dữ liệu sản xuất.

## Yêu cầu đã chốt
- Đóng sổ DSCL, CT_KV, DIEU_CHINH, FINAL theo năm/tháng/ngày/mã cửa hàng (mã CH từ cột `nha_may`/Nhà máy của DSCL).
- BC là dữ liệu cố định; không đóng sổ, không xóa, không tải theo kỳ.
- Snapshot trên Supabase bất biến, mã kỳ duy nhất, phân tách theo cửa hàng.
- Đồng bộ tự động về `D:\KIEM_KE_V10\YYYY\MM\DD\CH_<ma_ch>\KY_<id>\` khi Windows đăng nhập, kể cả khi máy đã tắt nhiều ngày.
- Bốn tệp: `DSCL.xlsx`, `CT_KV.xlsx`, `DIEU_CHINH.xlsx`, `FINAL.xlsx`.
- Chỉ báo Đã đồng bộ sau khi tải và kiểm tra cả bốn file; lỗi phải thử lại, không ghi đè kỳ khác.
- Chỉ admin được đóng sổ; không đưa service_role key vào frontend hoặc máy Windows.

## Các điều kiện phải xác minh trước khi chạy thực tế
1. Tên cột `Nhà máy` thực tế trong bảng `dscl` và quan hệ CT_KV -> cửa hàng; tuyệt đối không gán CT_KV theo mã SP nếu một mã xuất hiện tại nhiều cửa hàng.
2. FINAL của V10 hiện đang được tổng hợp động trên giao diện; phải chốt cách tái tạo kết quả ở backend tại cùng thời điểm snapshot, bao gồm điều chỉnh và trạng thái Admin.
3. Quyền RLS, auth cho Windows agent và cơ chế cấp/thu hồi quyền tải bản sao.
4. Cách tạo XLSX phía server hoặc phía Windows không cần Python, cơ chế kiểm tra checksum, manifest, retry và tránh race condition.
5. Cơ chế khóa kỳ và tạo kỳ mới không xóa/ghi đè dữ liệu của kỳ cũ; cần migration và thử trên Supabase staging.

## Phương án kỹ thuật
- Supabase Edge Function `close-period`: xác thực ADMIN, tạo snapshot transactionally hoặc bằng quy trình nhất quán, ghi `period_id`, `store_id`, `closed_at`, manifest.
- Supabase Storage private bucket chứa 4 file kỳ kiểm kê, được truy cập qua signed URL thời hạn ngắn do backend cấp.
- Windows Sync Agent được đóng gói EXE, chạy bằng Task Scheduler khi đăng nhập và kiểm tra định kỳ. Agent dùng đăng nhập riêng, không dùng service-role key.
- Agent đọc manifest những kỳ chưa đồng bộ, tải vào file tạm, kiểm tra SHA-256 và kích thước, chuyển file atomically, báo kết quả lên backend. Không xóa bản cloud.

## Lưu ý
Bản ZIP này **chưa phải bản đã tích hợp chức năng đóng sổ/đồng bộ**. Không được coi là đã triển khai khi chưa có Edge Function, schema và Windows Agent được kiểm thử. Tệp này dùng làm tiêu chí nghiệm thu để tránh phát sinh thay đổi sai logic kiểm kê.

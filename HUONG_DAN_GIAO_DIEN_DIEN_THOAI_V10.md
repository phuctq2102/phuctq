# V10 – Giao diện điện thoại cho nhân viên (bản chỉnh trên mã nguồn gốc)

## Thay đổi
- `src/EmployeeCheck.jsx`: bỏ giao diện camera/quét Barcode/QR; danh sách phân công và chi tiết sản phẩm được thiết kế lại cho điện thoại.
- `src/style.css`: thêm các quy tắc responsive chỉ dành cho giao diện nhân viên, giữ bảng desktop.
- Chi tiết hiển thị đầy đủ Barcode, Khu vực (sửa được), ĐVT nhập, SL nhập, SL quy đổi gốc, +/- SL, SL cuối, trạng thái tự lưu từng dòng.
- Rời khỏi ô +/- hoặc khu vực sẽ tự lưu điều chỉnh vào `dieu_chinh` nếu có thay đổi; không có nút Lưu từng dòng.
- `Thêm khu vực mới` chỉ yêu cầu Khu vực và SL thực tế (quy đổi); thêm mới ghi vào `dieu_chinh`.
- `Cập nhật đã kiểm` lưu những chỉnh sửa còn lại và chuyển `phan_cong.trang_thai` thành `Đã kiểm`.

## Cập nhật GitHub → Vercel
1. Giữ một bản sao mã nguồn đang chạy.
2. Giải nén ZIP này. Có thể chỉ thay `src/EmployeeCheck.jsx` và `src/style.css` vào repository hiện tại để giảm phạm vi thay đổi.
3. Commit/push lên nhánh GitHub mà Vercel dùng cho Production.
4. Vào Vercel → Deployments → đợi deployment mới có trạng thái Ready.
5. Mở trang bằng điện thoại và làm mới. Đăng nhập tài khoản nhân viên, vào Phân công → Kiểm tra.
6. Thử trên một mã hàng TEST: nhập +/- rồi rời ô, xem `dieu_chinh` có dòng mới; sau đó bấm `Cập nhật đã kiểm` và xác nhận `phan_cong` cập nhật. Kiểm tra FINAL với dữ liệu TEST.

## Lưu ý quan trọng
- Không cần chạy lại SQL, không cần tạo Supabase mới hoặc thay API keys.
- Cơ chế tự lưu yêu cầu RLS cho phép tài khoản nhân viên ghi vào `dieu_chinh` và cập nhật `phan_cong` theo chính sách hiện có.
- Dòng lấy từ BC chưa có `ct_kv_id` sẽ hiện cảnh báo khi cố sửa, để tránh ghi sai dữ liệu.
- Việc cập nhật nhiều dòng không phải giao dịch nguyên tử; hãy thử với dữ liệu TEST trước khi dùng thực tế.
- Bản ZIP này đã được chỉnh mã nguồn nhưng chưa thể chạy build đầy đủ trong môi trường tạo file do không tải được dependencies npm. Hãy chạy `npm ci` và `npm run build` trên máy hoặc theo dõi Vercel build.
- Không đưa service_role, sb_secret hoặc mật khẩu vào mã nguồn frontend.

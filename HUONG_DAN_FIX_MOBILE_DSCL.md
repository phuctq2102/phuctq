# FIX MOBILE V10 - đúng màn hình trong ảnh

Nguyên nhân: tab Danh sách mã hàng (DSCL) dùng `InventoryList.jsx`, trong khi bản trước chỉ có CSS mobile cho `EmployeeCheck.jsx` (tab Phân công). Vì vậy bảng DSCL và modal Chi tiết CT_KV vẫn giữ layout desktop.

Đã bổ sung CSS responsive vào cuối `src/style.css` cho cả danh sách DSCL và modal chi tiết. Không sửa logic đọc/ghi Supabase, không thay SQL, không đổi API, không thêm chức năng quét, không thay thao tác Cập nhật đã kiểm. Bản này chỉ xử lý giao diện. Tự động lưu cho tab DSCL KHÔNG được bổ sung; màn hình này vẫn dùng nút Cập nhật đã kiểm như code gốc.

## Cài đặt
1. Giải nén ZIP, vào `phuctq-main/src/style.css`.
2. Trên GitHub, mở đúng repo phuctq, thư mục `src`, file `style.css`, nhấn Edit, thay TOÀN BỘ nội dung bằng file này và Commit.
3. Vercel > phuctq > Deployments: chờ Ready cho commit mới.
4. iPhone Safari: mở phuctq.vercel.app, tải lại trang (nếu cần đóng tab cũ và mở tab mới).
5. Đăng nhập nhân viên > Danh sách mã hàng > Xem: modal phải phủ toàn màn hình, từng CT_KV thành thẻ.

Nếu không đổi: kiểm tra Vercel Production Deployment đang trỏ đúng commit mới; không chỉ upload file ZIP lên repo.

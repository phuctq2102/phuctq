V10 - Danh sách mã hàng / Barcode đúng ĐVT cơ bản DSCL

Thay đổi trong src/InventoryList.jsx:
- Một mã SP = một dòng.
- Chỉ hiện barcode khi ĐVT nguồn khớp DSCL.dvt_co_ban.
- CT_KV đối chiếu cột dvt_nhap; BC đối chiếu dvt_co_ban.
- Barcode không có ĐVT hoặc ĐVT không khớp không hiển thị.
- Gộp các barcode hợp lệ, loại trùng, phân cách bằng dấu ;.
- Tìm bằng mã SP, tên SP, hoặc barcode hợp lệ.
- Giữ bộ lọc KV và giao diện đã thiết kế.
- Menu DS mã hàng nhân viên có trong src/main.jsx.

Cảnh báo: Chưa xác minh cấu trúc dữ liệu thực tế / RLS và chưa build thành công trong môi trường này. Nếu CT_KV.dvt_nhap không đại diện ĐVT của barcode, cần bổ sung bảng ánh xạ barcode-ĐVT chuẩn; không nên đoán.
Giữ nguyên Supabase và không chạy SQL khi cập nhật giao diện này.

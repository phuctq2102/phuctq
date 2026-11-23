RESET_SAFE_BUILD_241126
1. File hiển thị phần quản lý kỳ là src/PeriodManager.jsx; src/main.jsx import nó.
2. Chỉ cập nhật src/PeriodManager.jsx (và src/main.jsx nếu dùng cả bộ ZIP).
3. Không xóa bất kỳ bảng Supabase nào.
4. Nếu website vẫn hiển thị Đóng sổ, Vercel đang build commit/repository khác; kiểm tra Deployment > Source và GitHub commit.
5. Không upload file .env.local; giữ biến môi trường trong Vercel.

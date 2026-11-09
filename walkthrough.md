# Hướng Dẫn & Báo Cáo Hoàn Thành: Chuẩn Hóa Cấu Trúc Đề Thi BGDĐT 2025 & File Word Mẫu

## 1. Tổng Quan Công Việc Đã Hoàn Thành
Hệ thống đã được nâng cấp toàn diện để đáp ứng 100% quy chuẩn cấu trúc Đề thi tốt nghiệp THPT từ năm 2025 của Bộ Giáo dục & Đào tạo (Chương trình GDPT 2018):
1. **Tích hợp File Word mẫu chuẩn Bộ GD&ĐT 2025**:
   - Tạo sẵn file mẫu: [`Mau_De_Thi_Chuan_BGDDT_2025.docx`](file:///d:/Kiemtraqualan/Mau_De_Thi_Chuan_BGDDT_2025.docx) đặt tại thư mục gốc và thư mục tải về của web server.
   - Thêm nút **"📥 Tải Mẫu Word (BGDĐT 2025)"** nổi bật ngay trên thanh công cụ giáo viên để tải về tức thì.
2. **Nâng cấp bộ bóc tách đề thi tự động (`wordExamParser.js`)**:
   - Nhận diện chuẩn xác 3 phần thi độc lập:
     - **PHẦN I**: Trắc nghiệm 4 phương án A, B, C, D (1 đáp án đúng hoặc nhiều đáp án).
     - **PHẦN II**: Trắc nghiệm Đúng/Sai gồm 4 lệnh hỏi a), b), c), d). Hỗ trợ cả 2 cách nhập đáp án: `Đáp án: a - Đ, b - S, c - Đ, d - Đ` hoặc đánh dấu hoa thị `*a)`, `b)`, `*c)`, `*d)`.
     - **PHẦN III**: Câu hỏi tự luận kèm điểm số và barem hướng dẫn chấm.
3. **Chấm điểm lũy tiến tự động theo Quyết định 764/QĐ-BGDĐT**:
   - Thí sinh trả lời đúng 1 ý = **0,10 điểm** (10% điểm tối đa câu).
   - Thí sinh trả lời đúng 2 ý = **0,25 điểm** (25% điểm tối đa câu).
   - Thí sinh trả lời đúng 3 ý = **0,50 điểm** (50% điểm tối đa câu).
   - Thí sinh trả lời đúng 4 ý = **1,00 điểm** (100% điểm tối đa câu).
   - Trả lời sai toàn bộ = **0,00 điểm**.
4. **Bảo toàn tính sư phạm khi xáo trộn đề (Anti-Cheat Shuffle)**:
   - Các câu hỏi Phần I xáo trộn nội bộ trong Phần I.
   - Các câu hỏi Phần II xáo trộn nội bộ trong Phần II.
   - **Thứ tự 4 ý con a), b), c), d) trong câu Đúng/Sai được giữ nguyên 100%** theo đúng logic mệnh đề.
   - Phần III (Tự luận) luôn cố định ở cuối đề thi.
5. **Giao diện làm bài của Học sinh (`StudentExam.jsx`)**:
   - Hiển thị bảng ma trận 4 dòng cho 4 ý a), b), c), d).
   - Mỗi dòng gồm 2 nút bấm trực quan: **[✓ ĐÚNG]** và **[✕ SAI]** với hiệu ứng nổi bật khi được chọn.
   - Tự động đồng bộ và lưu đáp án theo thời gian thực về máy chủ qua Socket.IO.
6. **Xem chi tiết & In bài thi PDF (`StudentPaperModal.jsx`)**:
   - Hiển thị bảng đối soát chi tiết từng ý a, b, c, d (Mệnh đề, Thí sinh chọn, Đáp án đúng, Đánh giá đúng/sai).
   - Tự động tổng kết: `Đúng X/4 ý ➔ Đạt Y/1.0đ (Chuẩn BGDĐT 2025)`.
   - Khung điểm tổng hợp linh hoạt 5 cột (Trắc nghiệm, Đúng/Sai, Tự luận, Tổng điểm, Lời phê).

---

## 2. Kết Quả Kiểm Thử Hệ Thống (Verification Results)
Đã chạy kịch bản kiểm thử tự động toàn diện (`scratch/verify_bgddt_2025.js`), kết quả đạt 100%:
- **Test 1**: Bóc tách tự động file Word mẫu chuẩn OpenXML ➔ Nhận diện đúng 5/5 câu (2 câu Phần I, 2 câu Phần II Đúng/Sai 4 ý, 1 câu Phần III Tự luận kèm barem).
- **Test 2**: Barem chấm điểm lũy tiến ➔ 0 ý: 0đ | 1 ý: 0.1đ | 2 ý: 0.25đ | 3 ý: 0.5đ | 4 ý: 1.0đ.
- **Test 3**: Sinh đề xáo trộn (Shuffle) ➔ Giữ nguyên thứ tự `[ 'a', 'b', 'c', 'd' ]` của câu Đúng/Sai; giữ nguyên vị trí Tự Luận ở cuối.
- **Test 4**: Tự động chấm điểm qua SQLite Database thật ➔ Khớp chính xác điểm số 1.75đ.
- **Build Client**: `npm run build` thành công không có bất kỳ lỗi cú pháp nào.
- **Server**: Đang chạy daemon tại `http://localhost:3000` (Dual-stack IPv4/IPv6).

---

## 3. Hướng Dẫn Nhanh Dành Cho Giáo Viên
1. **Tải file mẫu**:
   - Mở trình duyệt vào giao diện giáo viên: `http://localhost:3000/teacher`.
   - Bấm nút **"📥 Tải Mẫu Word (BGDĐT 2025)"**.
2. **Soạn đề trong Word**:
   - Mở file `.docx` vừa tải về, sửa đổi các câu hỏi theo nội dung bài học.
   - Phần II: Giữ cấu trúc các ý `a)`, `b)`, `c)`, `d)` và ghi `Đáp án: a - Đ, b - S, c - Đ, d - Đ` ở cuối câu (hoặc thêm dấu `*` trước các ý đúng: `*a)`).
3. **Nhập đề vào hệ thống**:
   - Bấm **"Nhập Đề Từ File Word (.docx)"** và chọn file Word của bạn.
   - Hệ thống sẽ tự động bóc tách và tạo đề thi chỉ trong 1 giây!

---

## 4. Ứng Dụng Độc Lập: Soạn & Trộn Đề Thi Word Chuẩn In Ấn Khảo Thí (`tools/App_TronDe_Word`)

Đã hoàn thành xây dựng và kiểm thử thành công ứng dụng độc lập chuyên biệt để soạn và trộn đề thi từ file Word:
- **Độc lập 100%**: Đặt tại [`tools/App_TronDe_Word/`](file:///d:/Kiemtraqualan/tools/App_TronDe_Word), khởi động bằng file 1-click [`KhoiDong_App_TronDe.bat`](file:///d:/Kiemtraqualan/KhoiDong_App_TronDe.bat) hoặc [`tools/App_TronDe_Word/KhoiDong_App_TronDe.bat`](file:///d:/Kiemtraqualan/tools/App_TronDe_Word/KhoiDong_App_TronDe.bat).
- **Quy chuẩn in ấn**:
  - Phông chữ: `Times New Roman`, Cỡ chữ: `12 pt`, Dãn dòng: `Single`, Dãn đoạn: `0 pt`.
  - Khổ giấy: `A4`, Lề trang: Đúng `1.0 cm` (567 dxa) cho cả 4 lề.
  - **Màu sắc & Bảo mật in**: Ép toàn bộ về **Màu Đen Chuẩn (#000000 / Auto)**, tự động xóa sạch vết đáp án (gạch chân, dấu hoa thị, [Đ]/[S]) trên đề thi học sinh.
  - **Chân trang (Footer)**: `Mã đề: [xxx] - Trang {PAGE}/{NUMPAGES}` tự động nhảy số trang khi in.
  - Tự động nhận diện độ dài phương án để dàn trang tiết kiệm giấy in (1 dòng 4 cột, 2 dòng 2 cột, hoặc 4 dòng).
  - Xuất riêng 1 file Word Bảng đáp án ma trận các mã đề (`Bang_Dap_An_Cac_Ma_De.docx`) phục vụ giáo viên soi chấm.
- **Hỗ trợ toàn diện 4 Dạng câu hỏi (Chuẩn BGDĐT 2025)**:
  - Dạng 1: Trắc nghiệm 4 lựa chọn (A, B, C, D).
  - Dạng 2: Trắc nghiệm Đúng / Sai (4 ý a, b, c, d).
  - Dạng 3: Trắc nghiệm Trả lời ngắn (điền kết quả trên phiếu riêng, đề thi KHÔNG in ô điền).
  - Dạng 4: Tự luận kèm thang điểm và barem chi tiết.
- **Trình Chỉnh Sửa Trực Quan (Interactive Exam Editor)**: Cho phép sửa nội dung câu hỏi, đổi đáp án đúng 1-click, đổi Đúng/Sai, lưu thay đổi trước khi trộn và xuất file Word đề gốc đã chỉnh sửa.
- **Kiểm định khảo thí tự động (Pre-flight Exam Inspector)**: Phát hiện trùng câu hỏi, trùng đáp án trong 1 câu, câu thiếu key đáp án, câu thiếu phương án trước khi xuất bản in.
- **Xuất File Mẫu Chuẩn (`/api/download-template`)**: Nút tải file Word mẫu chuẩn 4 dạng ngay trên giao diện web.



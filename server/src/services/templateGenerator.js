const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const escapeXml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildDocxXml(paragraphs) {
  const paragraphsXml = paragraphs.map(p => {
    if (p.runs && Array.isArray(p.runs)) {
      const runsXml = p.runs.map(r => {
        let rPr = '';
        if (r.underline || r.bold || r.italic) {
          rPr = `<w:rPr>${r.underline ? '<w:u w:val="single"/>' : ''}${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr>`;
        }
        return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
      }).join('');
      return `<w:p>${runsXml}</w:p>`;
    } else {
      let rPr = '';
      if (p.bold || p.italic) {
        rPr = `<w:rPr>${p.bold ? '<w:b/>' : ''}${p.italic ? '<w:i/>' : ''}</w:rPr>`;
      }
      return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(p.text || '')}</w:t></w:r></w:p>`;
    }
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;
}

async function createDocxBuffer(paragraphs) {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml', buildDocxXml(paragraphs));

  return await zip.generateAsync({ type: 'nodebuffer' });
}

// 1. MẪU TỔNG HỢP VNLAN (THAM KHẢO & TÙY CHỈNH THEO MÔN/KỲ THI)
function getTongHopParagraphs() {
  return [
    { text: 'TRƯỜNG THCS & THPT VNLAN', bold: true },
    { text: 'ĐỀ THI KIỂM TRA ĐỊNH KỲ (MẪU TỔNG HỢP THAM KHẢO VNLAN)', bold: true },
    { text: 'Thời gian làm bài: 45 phút (Đề thi gồm các nhóm câu hỏi tham khảo)', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: 'HƯỚNG DẪN DÀNH CHO GIÁO VIÊN SOẠN ĐỀ (CHUẨN VNLAN & MCMIX TƯƠNG THÍCH):', bold: true },
    { text: '1. Chọn đáp án đúng: Gạch chân chữ cái đầu (Ctrl+U: A.) HOẶC thêm dấu sao (*A.) HOẶC để Bảng đáp án ở cuối đề.' },
    { text: '2. Thẻ cố định không xáo trộn: [[FIX_QUESTION]] (hoặc <c>) để giữ nguyên vị trí câu hỏi; [[FIX_OPTION]] (hoặc <o>) để cố định phương án.' },
    { text: '3. Thẻ nhóm câu hỏi chung: Dùng [[GROUP_START:ID]] trước đoạn văn và [[GROUP_END:ID]] (hoặc <g>...</g>) sau câu cuối của nhóm.' },
    { text: '4. Câu Đúng/Sai: Khuyến nghị ghi rõ nhãn [Đ], [S] ở mỗi ý HOẶC dùng Bảng đáp án ở cuối đề để tránh nhầm lẫn.' },
    { text: '5. Câu trả lời ngắn: Ghi dòng "Đáp án: [giá trị]". Hỗ trợ nhiều đáp án tương đương qua dấu | (ví dụ: Đáp án: 2.5 | 2,5).' },
    { text: '------------------------------------------------------------------' },
    { text: '' },
    { text: 'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', bold: true },
    { text: 'Câu 1: Thiết bị nào sau đây là thiết bị nhập dữ liệu (Input) của máy tính?' },
    { text: 'A. Màn hình máy tính' },
    { runs: [{ text: 'B.', underline: true }, { text: ' Bàn phím máy tính' }] },
    { text: 'C. Máy in laser' },
    { text: 'D. Loa âm thanh' },
    { text: '' },
    { text: 'Câu 2: [[FIX_QUESTION]] Trong các phần mềm sau, đâu là phần mềm hệ thống?' },
    { text: 'A. Microsoft Word' },
    { text: 'B. Trình duyệt Google Chrome' },
    { text: '*C. Hệ điều hành Windows 11' },
    { text: '[[FIX_OPTION]] D. Cả 3 phương án trên đều là phần mềm ứng dụng' },
    { text: '' },
    { text: 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI', bold: true },
    { text: 'Câu 3: Cho các nhận định về hệ thống mạng khảo thí phòng máy tính:' },
    { text: 'a) Mạng LAN giúp truyền tải bài thi với độ trễ thấp và tốc độ ổn định. [Đ]' },
    { text: 'b) Khi mất mạng Internet quốc tế, thí sinh trong phòng máy LAN không thể nộp bài. [S]' },
    { text: 'c) Mỗi thí sinh chỉ được đăng nhập làm bài trên 1 máy tính duy nhất trong suốt ca thi. [Đ]' },
    { text: 'd) Địa chỉ IP 192.168.1.100 là địa chỉ IP công cộng được định tuyến toàn cầu. [S]' },
    { text: '' },
    { text: 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN', bold: true },
    { text: 'Câu 4: Một ô tô chuyển động thẳng đều đi được quãng đường 10 km trong 4 giờ. Tính vận tốc ô tô (km/h).' },
    { text: 'Đáp án: 2.5 | 2,5' },
    { text: '' },
    { text: 'PHẦN IV. TỰ LUẬN', bold: true },
    { text: 'Câu 5 (Tự luận): Nêu 2 ưu điểm của việc tổ chức thi trắc nghiệm trên mạng LAN nội bộ. (2.0 điểm)' },
    { text: 'Barem:' },
    { text: '- Bảo mật, cô lập hoàn toàn với Internet chống gian lận (1.0 điểm)' },
    { text: '- Ổn định, không phụ thuộc vào đường truyền ngoài (1.0 điểm)' },
    { text: '' },
    { text: 'BẢNG ĐÁP ÁN (TÙY CHỌN DÀNH CHO GIÁO VIÊN NẾU KHÔNG GẠCH CHÂN TRONG CÂU):', bold: true },
    { text: 'BẢNG ĐÁP ÁN PHẦN I:', bold: true },
    { text: '1.B   2.C' },
    { text: 'BẢNG ĐÁP ÁN PHẦN II:', bold: true },
    { text: '3: a-Đ, b-S, c-Đ, d-S' },
    { text: 'BẢNG ĐÁP ÁN PHẦN III:', bold: true },
    { text: '4: 2.5 | 2,5' }
  ];
}

// 2. MẪU CHUYÊN BIỆT TIN HỌC (CODE PYTHON, C++, PASCAL, THỤT LỀ, BẢNG DỮ LIỆU)
function getTinHocParagraphs() {
  return [
    { text: 'SỞ GD&ĐT • TRƯỜNG THCS & THPT VNLAN', bold: true },
    { text: 'ĐỀ THI MÔN TIN HỌC — ĐỊNH DẠNG CODE BLOCK & THỤT LỀ', bold: true },
    { text: 'Môn thi: Tin học (Thời gian làm bài: 45 phút)', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: 'QUY ƯỚC SOẠN ĐỀ TIN HỌC:', bold: true },
    { text: '1. Khối mã nguồn: Đặt trong khối ```python ... ``` hoặc thụt lề 4 space, hoặc font Consolas.' },
    { text: '2. Các câu lệnh như A = 10, B = 20 bên trong code được bảo toàn nguyên vẹn, không nhầm thành phương án trắc nghiệm.' },
    { text: '3. Đáp án câu trả lời ngắn code (print, def, return) được giữ nguyên dấu nháy và ký hiệu toán.' },
    { text: '------------------------------------------------------------------' },
    { text: '' },
    { text: 'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', bold: true },
    { text: 'Câu 1: Cho đoạn mã Python sau:' },
    { text: '```python' },
    { text: 'A = 10' },
    { text: 'B = 20' },
    { text: 'C = A + B' },
    { text: 'print("Kết quả:", C)' },
    { text: '```' },
    { text: 'Sau khi chạy chương trình, màn hình in ra kết quả nào sau đây?' },
    { text: 'A. Kết quả: 10' },
    { text: 'B. Kết quả: 20' },
    { runs: [{ text: 'C.', underline: true }, { text: ' Kết quả: 30' }] },
    { text: 'D. Báo lỗi cú pháp' },
    { text: '' },
    { text: 'Câu 2: Đoạn mã C++ nào sau đây khai báo đúng một mảng số nguyên gồm 10 phần tử?' },
    { text: 'A. array int a[10];' },
    { runs: [{ text: 'B.', underline: true }, { text: ' int a[10];' }] },
    { text: 'C. integer a(10);' },
    { text: 'D. int a = [10];' },
    { text: '' },
    { text: 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI', bold: true },
    { text: 'Câu 3: Cho đoạn chương trình Python tính tổng các số chẵn trong danh sách:' },
    { text: '```python' },
    { text: 'numbers = [1, 2, 3, 4, 5, 6]' },
    { text: 'total = 0' },
    { text: 'for x in numbers:' },
    { text: '    if x % 2 == 0:' },
    { text: '        total += x' },
    { text: 'print(total)' },
    { text: '```' },
    { text: 'Các phát biểu sau đây là đúng hay sai?' },
    { text: 'a) Vòng lặp for duyệt qua từng phần tử của danh sách numbers. [Đ]' },
    { text: 'b) Điều kiện x % 2 == 0 dùng để kiểm tra x là số lẻ. [S]' },
    { text: 'c) Biến total lưu giá trị tổng các số chẵn và in ra màn hình là 12. [Đ]' },
    { text: 'd) Khi danh sách rỗng, chương trình sẽ báo lỗi Exception. [S]' },
    { text: '' },
    { text: 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN', bold: true },
    { text: 'Câu 4: Viết câu lệnh Python chuẩn để xuất chuỗi chữ "Hello VNLAN" ra màn hình.' },
    { text: 'Đáp án: print("Hello VNLAN") | print(\'Hello VNLAN\')' },
    { text: '' },
    { text: 'BẢNG ĐÁP ÁN TIN HỌC:', bold: true },
    { text: '1.C   2.B' },
    { text: '3: a-Đ, b-S, c-Đ, d-S' },
    { text: '4: print("Hello VNLAN")' }
  ];
}

// 3. MẪU CHUYÊN BIỆT TOÁN & KHOA HỌC TỰ NHIÊN (CÔNG THỨC, MATHTYPE, ĐỒ THỊ)
function getToanKhtnParagraphs() {
  return [
    { text: 'TRƯỜNG THCS & THPT VNLAN', bold: true },
    { text: 'ĐỀ THI MÔN TOÁN & KHOA HỌC TỰ NHIÊN — CHUẨN CÔNG THỨC', bold: true },
    { text: 'Môn thi: Toán học / KHTN (Thời gian làm bài: 45 phút)', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: 'QUY ƯỚC SOẠN CÔNG THỨC TOÁN & KHTN:', bold: true },
    { text: '1. Hỗ trợ đầy đủ Word Equation (OMML), MathType OLE, hoặc ký hiệu LaTeX kẹp trong $...$.' },
    { text: '2. Các đáp án số thực chấp nhận cả dấu phẩy (2,5) và dấu chấm (2.5).' },
    { text: '3. Bảo toàn cú pháp tập nghiệm S = {2; 3} không bị cắt vụn.' },
    { text: '------------------------------------------------------------------' },
    { text: '' },
    { text: 'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', bold: true },
    { text: 'Câu 1: Nghiệm của phương trình bậc nhất $2x - 6 = 0$ là:' },
    { runs: [{ text: 'A.', underline: true }, { text: ' $x = 3$' }] },
    { text: 'B. $x = -3$' },
    { text: 'C. $x = 2$' },
    { text: 'D. $x = -2$' },
    { text: '' },
    { text: 'Câu 2: Đạo hàm của hàm số $y = x^3 - 3x + 1$ là:' },
    { text: 'A. $y\' = 3x^2 + 3$' },
    { runs: [{ text: 'B.', underline: true }, { text: ' $y\' = 3x^2 - 3$' }] },
    { text: 'C. $y\' = x^2 - 3$' },
    { text: 'D. $y\' = 3x^2 - 1$' },
    { text: '' },
    { text: 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI', bold: true },
    { text: 'Câu 3: Cho hàm số $f(x) = x^2 - 4x + 3$. Xét tính đúng sai của các mệnh đề sau:' },
    { text: 'a) Đồ thị hàm số là một parabol có bề lõm quay lên trên. [Đ]' },
    { text: 'b) Tọa độ đỉnh của parabol là $I(2; -1)$. [Đ]' },
    { text: 'c) Hàm số đồng biến trên khoảng $(-\\infty; 2)$. [S]' },
    { text: 'd) Phương trình $f(x) = 0$ có hai nghiệm phân biệt là $x = 1$ và $x = 3$. [Đ]' },
    { text: '' },
    { text: 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN', bold: true },
    { text: 'Câu 4: Cho tam giác vuông có hai cạnh góc vuông là 3 cm và 4 cm. Tính độ dài cạnh huyền theo đơn vị cm.' },
    { text: 'Đáp án: 5 | 5.0 | 5,0' },
    { text: '' },
    { text: 'Câu 5: Tìm tập hợp nghiệm S của phương trình $x^2 - 5x + 6 = 0$.' },
    { text: 'Đáp án: S = {2; 3} | S = {3; 2} | {2; 3}' },
    { text: '' },
    { text: 'BẢNG ĐÁP ÁN TOÁN & KHTN:', bold: true },
    { text: '1.A   2.B' },
    { text: '3: a-Đ, b-Đ, c-S, d-Đ' },
    { text: '4: 5' },
    { text: '5: S = {2; 3}' }
  ];
}

// 4. MẪU CHUYÊN BIỆT NGOẠI NGỮ & NGỮ VĂN (CHÙM NGỮ LIỆU ĐỌC HIỂU, TỰ LUẬN BAREM)
function getNgoaiNguNguVanParagraphs() {
  return [
    { text: 'TRƯỜNG THCS & THPT VNLAN', bold: true },
    { text: 'ĐỀ THI MÔN NGOẠI NGỮ & NGỮ VĂN — CHÙM NGỮ LIỆU ĐỌC HIỂU', bold: true },
    { text: 'Môn thi: Tiếng Anh / Ngữ văn (Thời gian làm bài: 45 phút)', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: 'QUY ƯỚC SOẠN ĐỀ NGOẠI NGỮ & ĐỌC HIỂU:', bold: true },
    { text: '1. Nhóm câu hỏi đọc hiểu: Đặt trong cặp thẻ [[GROUP_START:READING_01]] và [[GROUP_END:READING_01]] (hoặc <g>...</g>).' },
    { text: '2. Toàn bộ chùm câu hỏi sẽ luôn đi kèm đoạn văn ngữ liệu khi hoán vị mã đề.' },
    { text: '3. Phần Tự luận có barem chấm chi tiết từng tiêu chí điểm.' },
    { text: '------------------------------------------------------------------' },
    { text: '' },
    { text: 'PHẦN I. ĐỌC HIỂU (READING COMPREHENSION)', bold: true },
    { text: '[[GROUP_START:READING_01]]' },
    { text: 'Read the following passage and mark the letter A, B, C, or D on your answer sheet:' },
    { text: '"Local area networks (LANs) connect computers within a limited physical area, such as a school computer laboratory or an office building. LANs provide high data-transfer rates and low error rates, making them ideal for computer-based testing environments."' },
    { text: '' },
    { text: 'Câu 1: What is the main topic of the passage?' },
    { runs: [{ text: 'A.', underline: true }, { text: ' The features and applications of Local Area Networks' }] },
    { text: 'B. The history of computer inventions' },
    { text: 'C. The global structure of the Internet' },
    { text: 'D. Wireless telecommunication devices' },
    { text: '' },
    { text: 'Câu 2: According to the passage, which of the following is an advantage of LANs?' },
    { text: 'A. Unlimited physical range across continents' },
    { runs: [{ text: 'B.', underline: true }, { text: ' High data-transfer rates and low error rates' }] },
    { text: 'C. Requirement of international satellite connections' },
    { text: 'D. Inability to support examinations' },
    { text: '[[GROUP_END:READING_01]]' },
    { text: '' },
    { text: 'PHẦN II. TỰ LUẬN (WRITING)', bold: true },
    { text: 'Câu 3 (Tự luận): Write a short paragraph (50 - 80 words) about the benefits of using computers in classroom learning. (2.0 điểm)' },
    { text: 'Barem:' },
    { text: '- Task achievement: Clear ideas, answers all parts of the prompt (0.8 điểm)' },
    { text: '- Coherence and cohesion: Good organization and linking words (0.6 điểm)' },
    { text: '- Vocabulary and Grammar: Correct spelling and structures (0.6 điểm)' },
    { text: '' },
    { text: 'BẢNG ĐÁP ÁN NGOẠI NGỮ:', bold: true },
    { text: '1.A   2.B' }
  ];
}

// =================================================================
// 5. MẪU SOẠN CÂU HỎI CHO NGÂN HÀNG (BANK ITEM TEMPLATES)
// Hỗ trợ thẻ [[TOPIC]], [[LESSON]], và mức độ [NB], [TH], [VD], [VDC]
// =================================================================

function getBankTongHopParagraphs() {
  return [
    { text: 'BỘ CÂU HỎI MẪU NẠP VÀO NGÂN HÀNG CÂU HỎI (VNLAN ITEM BANK)', bold: true },
    { text: 'Môn: Tin học / Tổng hợp — Dành cho lưu trữ và sinh đề ma trận', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: 'HƯỚNG DẪN QUY ƯỚC SOẠN CÂU HỎI NGÂN HÀNG:', bold: true },
    { text: '1. Cây bài học: Dùng thẻ [[TOPIC: Tên Chủ Đề]] và [[LESSON: Tên Bài Học]].' },
    { text: '2. Mức độ nhận thức: Đặt thẻ đầu câu: [NB] (Nhận biết), [TH] (Thông hiểu), [VD] (Vận dụng), [VDC] (Vận dụng cao).' },
    { text: '3. Đáp án đúng: Gạch chân (Ctrl+U), dấu sao (*), hoặc thẻ [Đ]/[S], hoặc Đáp án: ...' },
    { text: '4. Không cần tiêu đề trường, không cần thời gian thi hay thang điểm bài thi.' },
    { text: '------------------------------------------------------------------' },
    { text: '' },
    { text: '[[TOPIC: Chủ đề 1: Máy tính và Xã hội tri thức]]', bold: true },
    { text: '[[LESSON: Bài 1: Thông tin và xử lý thông tin]]', bold: true },
    { text: '' },
    { text: '[NB] Câu 1: Thiết bị nào sau đây là thiết bị vào chuẩn của máy tính?' },
    { text: 'A. Màn hình máy tính' },
    { text: 'B. Máy in laser' },
    { runs: [{ text: 'C.', underline: true }, { text: ' Bàn phím' }] },
    { text: 'D. Loa' },
    { text: '' },
    { text: '[TH] Câu 2: Cho các phát biểu sau về thông tin và dữ liệu. Hãy xác định mỗi phát biểu là Đúng hay Sai:' },
    { text: 'a) Dữ liệu là các số liệu thô hoặc tín hiệu chưa qua xử lý. [Đ]' },
    { text: 'b) Thông tin là ý nghĩa được rút ra từ dữ liệu sau quá trình xử lý. [Đ]' },
    { text: 'c) Một dữ liệu chỉ có thể mang một thông tin duy nhất đối với mọi đối tượng tiếp nhận. [S]' },
    { text: 'd) Máy tính có thể xử lý trực tiếp thông tin của con người mà không cần số hóa. [S]' },
    { text: '' },
    { text: '[VD] Câu 3: Một thẻ nhớ dung lượng 16 GB có thể chứa tối đa bao nhiêu bức ảnh có dung lượng trung bình 4 MB?' },
    { text: 'Đáp án: 4096 | 4.096 | 4096 bức ảnh' },
    { text: '' },
    { text: '[VDC] Câu 4 (Tự luận): Phân tích tầm quan trọng của việc bảo vệ dữ liệu cá nhân trong kỷ nguyên số. Nêu 3 biện pháp cụ thể để đảm bảo an toàn thông tin khi tham gia môi trường mạng. (2.0 điểm)' },
    { text: 'Barem chấm:' },
    { text: '- Nêu được khái niệm và tầm quan trọng của dữ liệu cá nhân (0.5 điểm)' },
    { text: '- Nêu đúng 3 biện pháp phòng vệ thực tế: mật khẩu mạnh, xác thực 2 lớp, cảnh giác lừa đảo (1.5 điểm)' },
    { text: '' },
    { text: '[[TOPIC: Chủ đề 2: Mạng máy tính và Internet]]', bold: true },
    { text: '[[LESSON: Bài 2: Mạng cục bộ LAN]]', bold: true },
    { text: '' },
    { text: '[NB] Câu 5: Mạng cục bộ (LAN) là mạng kết nối các máy tính trong phạm vi nào?' },
    { runs: [{ text: 'A.', underline: true }, { text: ' Phạm vi địa lý hẹp như trong một phòng học, tòa nhà hoặc trường học' }] },
    { text: 'B. Phạm vi toàn cầu qua vệ tinh' },
    { text: 'C. Phạm vi giữa nhiều quốc gia' },
    { text: 'D. Phạm vi không giới hạn khoảng cách vật lý' }
  ];
}

function getBankTinHocParagraphs() {
  return [
    { text: 'NGÂN HÀNG CÂU HỎI MÔN TIN HỌC — CODE PYTHON & C++', bold: true },
    { text: 'Tài liệu tích lũy kho câu hỏi lập trình giữ nguyên thụt lề', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: '[[TOPIC: Lập trình cơ bản]]', bold: true },
    { text: '[[LESSON: Cấu trúc điều khiển và lặp]]', bold: true },
    { text: '' },
    { text: '[NB] Câu 1: Trong Python, từ khóa nào sau đây dùng để khai báo một hàm?' },
    { runs: [{ text: 'A.', underline: true }, { text: ' def' }] },
    { text: 'B. function' },
    { text: 'C. procedure' },
    { text: 'D. sub' },
    { text: '' },
    { text: '[TH] Câu 2: Cho đoạn chương trình Python sau:' },
    { text: '```python' },
    { text: 's = 0' },
    { text: 'for i in range(1, 5):' },
    { text: '    s += i' },
    { text: 'print(s)' },
    { text: '```' },
    { text: 'Sau khi chạy xong đoạn mã trên, giá trị in ra màn hình là bao nhiêu?' },
    { text: 'A. 4' },
    { runs: [{ text: 'B.', underline: true }, { text: ' 10' }] },
    { text: 'C. 15' },
    { text: 'D. 0' },
    { text: '' },
    { text: '[VD] Câu 3: Xét đoạn mã C++ sau. Hãy xác định tính Đúng/Sai của các nhận định:' },
    { text: '```cpp' },
    { text: 'int a = 10, b = 20;' },
    { text: 'int max_val = (a > b) ? a : b;' },
    { text: '```' },
    { text: 'a) Biến max_val nhận giá trị 20 sau khi thực hiện. [Đ]' },
    { text: 'b) Toán tử "? :" là toán tử ba ngôi (ternary operator). [Đ]' },
    { text: 'c) Biểu thức (a > b) trả về giá trị true. [S]' },
    { text: 'd) Nếu đổi điều kiện thành (a < b) thì max_val nhận giá trị 10. [S]' },
    { text: '' },
    { text: '[VDC] Câu 4: Cho hàm đệ quy Python sau tính số Fibonacci:' },
    { text: '```python' },
    { text: 'def fib(n):' },
    { text: '    if n <= 1:' },
    { text: '        return n' },
    { text: '    return fib(n - 1) + fib(n - 2)' },
    { text: '```' },
    { text: 'Giá trị trả về của lời gọi hàm fib(6) là bao nhiêu?' },
    { text: 'Đáp án: 8' }
  ];
}

function getBankToanKhtnParagraphs() {
  return [
    { text: 'NGÂN HÀNG CÂU HỎI MÔN TOÁN & KHOA HỌC TỰ NHIÊN', bold: true },
    { text: 'Tài liệu tích lũy kho câu hỏi công thức MathType và OMML', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: '[[TOPIC: Hàm số và Đồ thị]]', bold: true },
    { text: '[[LESSON: Khảo sát hàm số bậc ba]]', bold: true },
    { text: '' },
    { text: '[NB] Câu 1: Cho hàm số $y = x^3 - 3x + 2$. Điểm cực đại của đồ thị hàm số là:' },
    { runs: [{ text: 'A.', underline: true }, { text: ' $(-1; 4)$' }] },
    { text: 'B. $(1; 0)$' },
    { text: 'C. $(0; 2)$' },
    { text: 'D. $(2; 4)$' },
    { text: '' },
    { text: '[TH] Câu 2: Nghiệm của phương trình $\\log_2(x - 1) = 3$ là:' },
    { text: 'A. $x = 7$' },
    { text: 'B. $x = 8$' },
    { runs: [{ text: 'C.', underline: true }, { text: ' $x = 9$' }] },
    { text: 'D. $x = 10$' },
    { text: '' },
    { text: '[VD] Câu 3: Tính diện tích hình phẳng giới hạn bởi đồ thị $y = x^2$ và đường thẳng $y = 2x$.' },
    { text: 'Đáp án: 4/3 | 1.33 | 1,33' }
  ];
}

function getBankNgoaiNguParagraphs() {
  return [
    { text: 'NGÂN HÀNG CÂU HỎI NGOẠI NGỮ & ĐỌC HIỂU NGỮ VĂN', bold: true },
    { text: 'Tài liệu tích lũy câu hỏi chùm ngữ liệu chung và đọc hiểu', italic: true },
    { text: '------------------------------------------------------------------' },
    { text: '[[TOPIC: English Reading Skills]]', bold: true },
    { text: '[[LESSON: Technology in Education]]', bold: true },
    { text: '' },
    { text: '[[GROUP_START:TECH_ED]]' },
    { text: 'Read the text and answer the questions that follow:' },
    { text: '"Digital learning tools enable personalized education at every student\'s pace. Through local networked computer labs, schools can deliver reliable assessments without reliance on external internet stability."' },
    { text: '' },
    { text: '[NB] Câu 1: What is the main benefit mentioned in the passage?' },
    { runs: [{ text: 'A.', underline: true }, { text: ' Personalized learning and reliable local assessment' }] },
    { text: 'B. Replacing classroom teachers with robots' },
    { text: 'C. Eliminating computers completely' },
    { text: 'D. Increasing external connection costs' },
    { text: '' },
    { text: '[TH] Câu 2: According to the passage, local networked computer labs:' },
    { runs: [{ text: 'A.', underline: true }, { text: ' Do not rely heavily on external internet stability' }] },
    { text: 'B. Always require high satellite bandwidth' },
    { text: 'C. Are only used for entertainment' },
    { text: 'D. Cannot run exam software' },
    { text: '[[GROUP_END:TECH_ED]]' }
  ];
}

// -----------------------------------------------------------------
// DANH MỤC CẤU HÌNH TỆP MẪU THEO HAI NGHIỆP VỤ ĐỘC LẬP
// -----------------------------------------------------------------

// Danh mục mẫu ĐỀ THI KIỂM TRA ĐÁNH GIÁ (Exam Templates)
const EXAM_TEMPLATE_CONFIGS = [
  {
    type: 'tong_hop',
    fileName: 'Mau_De_Thi_VNLAN_Tong_Hop.docx',
    generator: getTongHopParagraphs,
    description: 'Mẫu Đề thi Tổng hợp VNLAN (có Header trường, thời gian 45 phút, thang điểm 10)'
  },
  {
    type: 'tin_hoc',
    fileName: 'Mau_De_Thi_Tin_Hoc_Lap_Trinh.docx',
    generator: getTinHocParagraphs,
    description: 'Mẫu Đề thi môn Tin học (Code block Python/C++, thụt lề, bảng đáp án)'
  },
  {
    type: 'toan_khtn',
    fileName: 'Mau_De_Thi_Toan_KHTN_Cong_Thuc.docx',
    generator: getToanKhtnParagraphs,
    description: 'Mẫu Đề thi môn Toán & KHTN (MathType, OMML, thang điểm phân bổ)'
  },
  {
    type: 'ngoai_ngu',
    fileName: 'Mau_De_Thi_Ngoai_Ngu_Ngu_Van.docx',
    generator: getNgoaiNguNguVanParagraphs,
    description: 'Mẫu Đề thi Ngoại ngữ & Ngữ văn (Chùm đọc hiểu, tự luận barem điểm)'
  }
];

// Danh mục mẫu SOẠN CÂU HỎI CHO NGÂN HÀNG (Bank Item Templates)
const BANK_TEMPLATE_CONFIGS = [
  {
    type: 'bank_tong_hop',
    fileName: 'Mau_Ngan_Hang_Cau_Hoi_Tong_Hop.docx',
    generator: getBankTongHopParagraphs,
    description: 'Mẫu Ngân hàng câu hỏi tổng hợp (Chủ đề, Bài học, thẻ [NB], [TH], [VD], [VDC])'
  },
  {
    type: 'bank_tin_hoc',
    fileName: 'Mau_Ngan_Hang_Tin_Hoc_Lap_Trinh.docx',
    generator: getBankTinHocParagraphs,
    description: 'Mẫu Ngân hàng môn Tin học (Code Python/C++, thụt lề, thẻ mức độ nhận thức)'
  },
  {
    type: 'bank_toan_khtn',
    fileName: 'Mau_Ngan_Hang_Toan_KHTN.docx',
    generator: getBankToanKhtnParagraphs,
    description: 'Mẫu Ngân hàng môn Toán & KHTN (Công thức MathType, OMML, thẻ mức độ)'
  },
  {
    type: 'bank_ngoai_ngu',
    fileName: 'Mau_Ngan_Hang_Ngoai_Ngu_Van.docx',
    generator: getBankNgoaiNguParagraphs,
    description: 'Mẫu Ngân hàng Ngoại ngữ & Đọc hiểu (Chùm ngữ liệu chung, thẻ mức độ)'
  }
];

// Giữ TEMPLATE_CONFIGS tương thích ngược
const TEMPLATE_CONFIGS = EXAM_TEMPLATE_CONFIGS;

async function generateAllStandardTemplates() {
  const publicTemplatesDir = path.resolve(__dirname, '../../public/templates');
  const rootDir = path.resolve(__dirname, '../../..');

  if (!fs.existsSync(publicTemplatesDir)) {
    fs.mkdirSync(publicTemplatesDir, { recursive: true });
  }

  const generated = {};

  const allConfigs = [...EXAM_TEMPLATE_CONFIGS, ...BANK_TEMPLATE_CONFIGS];

  for (const cfg of allConfigs) {
    const paragraphs = cfg.generator();
    const buffer = await createDocxBuffer(paragraphs);

    const publicPath = path.join(publicTemplatesDir, cfg.fileName);
    const rootPath = path.join(rootDir, cfg.fileName);

    try {
      fs.writeFileSync(publicPath, buffer);
      fs.writeFileSync(rootPath, buffer);
    } catch (err) {
      console.warn(`[templateGenerator] Warning saving ${cfg.fileName}:`, err.message);
    }

    generated[cfg.type] = {
      type: cfg.type,
      fileName: cfg.fileName,
      publicPath,
      rootPath,
      buffer
    };
  }

  // Tương thích ngược: Sao chép Mau_De_Thi_VNLAN_Tong_Hop.docx thành Mau_De_Thi_Chuan_BGDDT_2025.docx
  // để các liên kết cũ không bị 404
  if (generated.tong_hop) {
    const legacyBuffer = generated.tong_hop.buffer;
    try {
      fs.writeFileSync(path.join(publicTemplatesDir, 'Mau_De_Thi_Chuan_BGDDT_2025.docx'), legacyBuffer);
      fs.writeFileSync(path.join(rootDir, 'Mau_De_Thi_Chuan_BGDDT_2025.docx'), legacyBuffer);
    } catch (err) {
      console.warn('[templateGenerator] Warning writing legacy alias:', err.message);
    }
  }

  return generated;
}

async function generateOfficialWordTemplate() {
  const all = await generateAllStandardTemplates();
  return all.tong_hop;
}

module.exports = {
  EXAM_TEMPLATE_CONFIGS,
  BANK_TEMPLATE_CONFIGS,
  TEMPLATE_CONFIGS,
  generateAllStandardTemplates,
  generateOfficialWordTemplate
};

if (require.main === module) {
  generateAllStandardTemplates()
    .then((res) => console.log('Successfully generated all 4 templates:', Object.keys(res)))
    .catch(console.error);
}

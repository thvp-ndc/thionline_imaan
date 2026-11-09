import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  CheckCircle2, 
  Settings2, 
  Building2, 
  Layers, 
  X, 
  Sparkles, 
  FileArchive, 
  HelpCircle,
  FileCheck2,
  AlertCircle
} from 'lucide-react';

export default function ExamExportModal({ 
  isOpen, 
  onClose, 
  exam, 
  onOpenShuffleModal 
}) {
  const [activeTab, setActiveTab] = useState('student'); // 'student' | 'teacher_key' | 'package'
  const [margins, setMargins] = useState('narrow'); // 'narrow' (1cm) | 'normal' (2cm)
  const [showScore, setShowScore] = useState(false);
  const [includeExaminerBox, setIncludeExaminerBox] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [academicYear, setAcademicYear] = useState('2025 - 2026');
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Nạp thông tin trường mặc định từ hệ thống
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      fetch('/api/system/school-info')
        .then(r => r.json())
        .then(data => {
          if (data.success && data.schoolInfo) {
            setSchoolName(data.schoolInfo.school_name || exam?.school_name || '');
            setDepartmentName(data.schoolInfo.department_name || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO');
            setAcademicYear(data.schoolInfo.academic_year || '2025 - 2026');
          } else {
            setSchoolName(exam?.school_name || '');
          }
        })
        .catch(() => {
          setSchoolName(exam?.school_name || '');
        });
    }
  }, [isOpen, exam]);

  if (!isOpen || !exam) return null;

  const handleDownloadWord = () => {
    try {
      setDownloading(true);
      setErrorMsg('');
      const params = new URLSearchParams({
        mode: activeTab === 'teacher_key' ? 'teacher_key' : 'student',
        margins: margins,
        showScore: showScore ? '1' : '0',
        includeExaminerBox: includeExaminerBox ? '1' : '0'
      });

      if (schoolName.trim()) params.append('schoolName', schoolName.trim());
      if (departmentName.trim()) params.append('departmentName', departmentName.trim());
      if (academicYear.trim()) params.append('academicYear', academicYear.trim());

      const url = `/api/exams/${exam.id}/export-word?${params.toString()}`;
      window.open(url, '_blank');
      
      setTimeout(() => {
        setDownloading(false);
        onClose();
      }, 1000);
    } catch (err) {
      setErrorMsg(err.message);
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn select-none">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Modal */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-xs">
              <Printer className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Xuất Đề Thi & Tài Liệu Khảo Thí</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                  A4 Word .docx
                </span>
              </h3>
              <p className="text-xs text-blue-100/90 truncate max-w-md mt-0.5">
                {exam.title} ({exam.subject || 'Tổng hợp'} - Khối {exam.grade || '12'})
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'student'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>1. Đề In Cho Học Sinh</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('teacher_key')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'teacher_key'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>2. Đề Lưu Trữ & Barem</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenShuffleModal) {
                onClose();
                onOpenShuffleModal(exam);
              } else {
                setActiveTab('package');
              }
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'package'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>3. Trộn Đề Hoán Vị (.ZIP)</span>
          </button>
        </div>

        {/* Body Cấu Hình */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mô tả chế độ */}
          <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">
                {activeTab === 'student' && 'Chế độ Đề in Học sinh (Student Paper):'}
                {activeTab === 'teacher_key' && 'Chế độ Đề Giáo viên & Hướng dẫn chấm (Teacher Key):'}
                {activeTab === 'package' && 'Gói in đề thi hoán vị phòng thi (Multi-variant Package):'}
              </p>
              <p className="text-[11px] text-blue-700/90 mt-0.5 leading-relaxed">
                {activeTab === 'student' && 'Tuyệt đối KHÔNG chứa đáp án (không gạch chân, không bảng đáp án cuối đề). Tự động dàn 2-4 cột tiết kiệm giấy in, có khung phách học sinh và dòng kẻ làm bài.'}
                {activeTab === 'teacher_key' && 'Gạch chân và in đậm đáp án đúng ngay trong từng câu. Đầy đủ Bảng ma trận đáp án 10 cột, bảng Đúng/Sai và Barem hướng dẫn chấm tự luận ở cuối đề.'}
                {activeTab === 'package' && 'Sinh đồng loạt 2-8 mã đề hoán vị (101, 102...) kèm File Word Hướng dẫn chấm tổng hợp và File Excel ma trận đối chiếu đáp án phục vụ soi đục lỗ.'}
              </p>
            </div>
          </div>

          {/* Cấu hình Định Dạng & Tiết Kiệm Giấy In */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Tùy Chọn Định Dạng Bản In (Word OpenXML)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Lề in */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <label className="font-semibold text-slate-800 block">Kiểu căn lề trang in:</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="margins"
                      value="narrow"
                      checked={margins === 'narrow'}
                      onChange={() => setMargins('narrow')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-700">Lề hẹp 1.0cm - 1.2cm (Tiết kiệm giấy in tối đa)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="margins"
                      value="normal"
                      checked={margins === 'normal'}
                      onChange={() => setMargins('normal')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-600">Lề chuẩn 2.0cm - 2.5cm (Đóng gáy / Lưu hồ sơ)</span>
                  </label>
                </div>
              </div>

              {/* Tùy chọn hiển thị */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <label className="font-semibold text-slate-800 block">Tùy chọn nội dung câu hỏi:</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showScore}
                      onChange={(e) => setShowScore(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Hiển thị điểm số chi tiết từng câu (ví dụ: 0.25đ)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeExaminerBox}
                      onChange={(e) => setIncludeExaminerBox(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Thêm khung Điểm & Lời phê của Giám khảo</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Tùy Chỉnh Thông Tin Tiêu Đề Trường */}
          <div className="space-y-3 pt-1 border-t border-slate-200">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Thông Tin Tiêu Đề Trường & Đơn Vị</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">Cơ quan chủ quản (Sở/Phòng):</label>
                <input
                  type="text"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  placeholder="SỞ GIÁO DỤC VÀ ĐÀO TẠO"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">Tên trường học:</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="TRƯỜNG THPT ..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">Năm học:</label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="2025 - 2026"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Footer Modal */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleDownloadWord}
            disabled={downloading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloading ? 'Đang Tạo File Word...' : (
                activeTab === 'student' ? 'Tải Đề In Học Sinh (.docx)' : 'Tải Đề Kèm Đáp Án & Barem (.docx)'
              )}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}

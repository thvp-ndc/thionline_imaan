import React, { useRef } from 'react';
import { Printer, X, Download, School, FileText, CheckCircle2 } from 'lucide-react';

export default function PrintSbdModal({
  isOpen,
  onClose,
  students = [],
  schoolName = 'TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
  className = ''
}) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl text-slate-800 animate-fadeIn">
        {/* Header - Screen Only */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">In Thẻ / Phiếu Số Báo Danh Phòng Máy</h3>
              <p className="text-xs text-slate-500">Xem trước thẻ dán máy hoặc danh sách ký tên ({students.length} học sinh)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Ngay (Print)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 print:bg-white print:p-0 print:overflow-visible">
          {/* Header Paper for Print */}
          <div className="text-center space-y-1 border-b border-slate-300 pb-4">
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">{schoolName}</div>
            <h2 className="text-lg font-black text-slate-900 uppercase">PHIẾU SỐ BÁO DANH & ĐĂNG NHẬP THI TRỰC TUYẾN</h2>
            <p className="text-xs text-slate-500 italic">
              (Dùng dán tại bàn máy tính hoặc phát cho thí sinh đối chiếu)
            </p>
          </div>

          {/* Cards Grid: 3 cards per row on A4, 2 per row on smaller */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
            {students.map((st, idx) => (
              <div
                key={st.id || idx}
                className="bg-white border-2 border-slate-300 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs relative overflow-hidden print:shadow-none print:break-inside-avoid print:border-dashed"
              >
                <div className="border-b border-slate-200 pb-2 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">MÁY THI SỐ: {idx + 1}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    LỚP {st.class_name || className || '-'}
                  </span>
                </div>

                <div className="space-y-1.5 my-1 text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">SỐ BÁO DANH ĐĂNG NHẬP</div>
                  <div className="font-mono text-xl font-black text-blue-700 tracking-wider bg-blue-50 py-1 px-2 rounded-lg border border-blue-200 inline-block">
                    {st.student_code || '(Chưa có SBD)'}
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate mt-1">
                    {st.student_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {st.dob ? `Ngày sinh: ${st.dob} • ` : ''}Giới tính: <strong>{st.gender || 'Nam'}</strong>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2 mt-2 text-[10px] text-slate-400 flex items-center justify-between italic">
                  <span>Hệ thống VNLAN</span>
                  <span>Ký tên: ___________</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer - Screen Only */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white rounded-b-2xl print:hidden shrink-0">
          <div className="text-xs text-slate-500">
            Tổng cộng: <strong className="text-slate-800">{students.length}</strong> phiếu SBD phòng máy
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Đóng
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu Ngay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

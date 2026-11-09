import React from 'react';
import { CheckCircle2, ShieldCheck, Clock, CheckSquare, Award, LogOut, Lock } from 'lucide-react';
import { formatToLocalTime } from '../../utils/timeFormat';

export default function StudentResult({ result, onRestart }) {
  const canShowScore = Boolean(result.show_score && result.total_score !== undefined && result.total_score !== null);
  const isFullyGraded = result.is_graded === 1;

  const formatSubmittedTime = (isoString) => {
    if (!isoString) {
      return formatToLocalTime(new Date(), true);
    }
    return formatToLocalTime(isoString, true);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 select-none">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-7 shadow-xl text-center space-y-6">
        
        {/* Header Icon */}
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Nộp Bài Thi Thành Công!</h2>
          <p className="text-slate-600 text-sm mt-1.5 leading-relaxed">
            {result.message || 'Bài thi của bạn đã được ghi nhận thành công trên máy chủ.'}
          </p>
        </div>

        {/* Thông tin biên nhận nộp bài an toàn */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 text-xs text-slate-600">
          {(result.student_name || result.student_code) && (
            <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
              <span className="font-medium text-slate-500">Thí sinh:</span>
              <span className="font-bold text-slate-800 text-sm">
                {result.student_name ? `${result.student_name} (${result.student_code})` : result.student_code}
              </span>
            </div>
          )}

          {result.class_name && (
            <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
              <span className="font-medium text-slate-500">Lớp thi:</span>
              <span className="font-semibold text-slate-700">{result.class_name}</span>
            </div>
          )}

          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="font-medium text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Thời gian nộp:
            </span>
            <span className="font-semibold text-slate-700">{formatSubmittedTime(result.submitted_at)}</span>
          </div>

          {(result.total_questions !== undefined && result.total_questions > 0) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center">
                <span className="font-medium text-slate-500 flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                  Số câu hoàn thành:
                </span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {result.completed_count ?? result.answered_count ?? 0} / {result.total_questions} câu
                </span>
              </div>
              {result.answered_count > (result.completed_count ?? result.answered_count) && (
                <div className="flex justify-between items-center text-[11px] text-amber-700 bg-amber-50/60 px-2.5 py-1 rounded-lg">
                  <span>Câu làm một phần (chưa đủ 4 ý):</span>
                  <span className="font-bold">
                    {result.answered_count - (result.completed_count ?? result.answered_count)} câu
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chế độ 1: Khi được phép xem điểm (Immediate hoặc Manual Release) */}
        {canShowScore ? (
          <div className="space-y-3">
            {/* Phân rã điểm chuẩn khảo thí Bộ GD&ĐT 2025 hoặc Fallback cổ điển */}
            {(result.part1_stats || result.part2_stats || result.part3_stats) ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {/* Phần I: Trắc nghiệm 4 lựa chọn */}
                  <div className="bg-blue-50/60 border border-blue-200/80 p-2.5 rounded-xl text-center">
                    <span className="text-[10px] text-blue-800 uppercase font-bold tracking-tight block">Phần I (MCQ)</span>
                    <p className="text-lg font-black text-blue-700 mt-0.5">{result.part1_stats?.score ?? 0} đ</p>
                    <span className="text-[9px] text-blue-600 block mt-0.5">
                      Đúng {result.part1_stats?.correct ?? 0}/{result.part1_stats?.total ?? 0} câu
                    </span>
                  </div>

                  {/* Phần II: Đúng / Sai */}
                  <div className="bg-teal-50/60 border border-teal-200/80 p-2.5 rounded-xl text-center">
                    <span className="text-[10px] text-teal-800 uppercase font-bold tracking-tight block">Phần II (Đ/S)</span>
                    <p className="text-lg font-black text-teal-700 mt-0.5">{result.part2_stats?.score ?? 0} đ</p>
                    <span className="text-[9px] text-teal-600 block mt-0.5">
                      Đúng {result.part2_stats?.correct_sub ?? 0}/{result.part2_stats?.total_sub ?? 0} ý
                    </span>
                  </div>

                  {/* Phần III: Trả lời ngắn */}
                  <div className="bg-violet-50/60 border border-violet-200/80 p-2.5 rounded-xl text-center">
                    <span className="text-[10px] text-violet-800 uppercase font-bold tracking-tight block">Phần III (Ngắn)</span>
                    <p className="text-lg font-black text-violet-700 mt-0.5">{result.part3_stats?.score ?? 0} đ</p>
                    <span className="text-[9px] text-violet-600 block mt-0.5">
                      Đúng {result.part3_stats?.correct ?? 0}/{result.part3_stats?.total ?? 0} câu
                    </span>
                  </div>
                </div>

                {/* Phần Tự luận nếu đề thi có tự luận */}
                {(result.essay_stats && result.essay_stats.total > 0) && (
                  <div className="bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
                    <div className="text-left">
                      <span className="text-[10px] text-amber-800 uppercase font-bold block">Phần Tự Luận</span>
                      <span className="text-[10px] text-amber-600">
                        {isFullyGraded ? 'Đã chấm xong' : 'Giáo viên đang chấm'}
                      </span>
                    </div>
                    <p className="text-base font-black text-amber-700">
                      {isFullyGraded ? `${result.essay_stats.score} đ` : 'Chờ chấm'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Fallback 2 Thẻ truyền thống cho đề cũ */
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50/50 border border-blue-200/70 p-3.5 rounded-2xl">
                  <span className="text-[11px] text-blue-700 uppercase font-bold tracking-wide">Trắc Nghiệm</span>
                  <p className="text-2xl font-black text-blue-700 mt-1">{result.mcq_score} đ</p>
                  <span className="text-[10px] text-blue-500 font-medium">Tự động chấm</span>
                </div>

                <div className="bg-amber-50/50 border border-amber-200/70 p-3.5 rounded-2xl">
                  <span className="text-[11px] text-amber-700 uppercase font-bold tracking-wide">Tự Luận</span>
                  <p className="text-2xl font-black text-amber-700 mt-1">
                    {isFullyGraded ? `${result.essay_score} đ` : 'Chờ Chấm'}
                  </p>
                  <span className="text-[10px] text-amber-600 font-medium">
                    {isFullyGraded ? 'Đã chấm xong' : 'Giáo viên đang chấm'}
                  </span>
                </div>
              </div>
            )}

            {/* Total Score Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 text-center shadow-md">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100 flex items-center justify-center gap-1">
                <Award className="w-4 h-4" />
                Tổng Điểm Bài Thi
              </span>
              <p className="text-3xl font-black mt-1">
                {result.total_score} <span className="text-sm font-normal text-blue-200">/ 10</span>
              </p>
              {!isFullyGraded && (
                <p className="text-[11px] text-amber-200 mt-1">
                  * Điểm tổng kết cuối cùng sẽ được cập nhật sau khi giáo viên hoàn thành chấm bài tự luận.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Chế độ 2: Khi điểm bị ẩn hoặc chờ giáo viên công bố (Strict Zero-Leakage) */
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-left flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Bảo Mật Điểm Số Phòng Thi</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Điểm số của ca thi này được bảo mật và sẽ do giáo viên công bố theo quy định của phòng thi.
              </p>
              <p className="text-[11px] text-amber-700/80 italic pt-1">
                * Vui lòng giữ trật tự và chờ hiệu lệnh từ giám thị phòng thi.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={onRestart}
          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          <span>Trở Về Màn Hình Đăng Nhập</span>
        </button>
      </div>
    </div>
  );
}

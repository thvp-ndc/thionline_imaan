import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, X, Search, CheckCircle2, UserCheck, School, AlertCircle, RefreshCw } from 'lucide-react';

export default function SessionStudentsModal({ session, onClose, onUpdated }) {
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'by_class' | 'individual'
  const [selectedClass, setSelectedClass] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSessionStudents = async () => {
    try {
      setLoading(true);
      const [resAssigned, resAll] = await Promise.all([
        fetch(`/api/sessions/${session.id}/students`).then(r => r.json()),
        fetch('/api/students').then(r => r.json())
      ]);

      if (resAssigned.success) {
        setAssignedStudents(resAssigned.students || []);
      }
      if (resAll.success) {
        setAllStudents(resAll.students || []);
        setClasses(resAll.classes || []);
        if (resAll.classes?.length > 0 && !selectedClass) {
          setSelectedClass(resAll.classes[0]);
        }
      }
    } catch (err) {
      console.error('Fetch session students error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionStudents();
  }, [session.id]);

  const handleAddByClass = async () => {
    if (!selectedClass) return alert('Vui lòng chọn một lớp học!');
    try {
      setSubmitting(true);
      const res = await fetch(`/api/sessions/${session.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: selectedClass })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã thêm ${data.addedCount} học sinh lớp ${selectedClass} vào ca thi!`);
        fetchSessionStudents();
        if (onUpdated) onUpdated();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSingleStudent = async (studentId) => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/sessions/${session.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [studentId] })
      });
      const data = await res.json();
      if (data.success) {
        fetchSessionStudents();
        if (onUpdated) onUpdated();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveStudent = async (studentId, studentName) => {
    if (!confirm(`Xóa thí sinh [${studentName}] khỏi ca thi này?`)) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/students/${studentId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchSessionStudents();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Bạn có chắc muốn XÓA TOÀN BỘ học sinh trong ca thi này? (Ca thi sẽ trở về chế độ tự do)')) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/students`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchSessionStudents();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Filtered assigned students
  const filteredAssigned = assignedStudents.filter(s => {
    const q = searchTerm.toLowerCase();
    return s.student_code.toLowerCase().includes(q) ||
           s.student_name.toLowerCase().includes(q) ||
           (s.class_name && s.class_name.toLowerCase().includes(q));
  });

  // Available students in bank not yet in this session
  const assignedIds = new Set(assignedStudents.map(s => s.id));
  const availableStudents = allStudents.filter(s => {
    if (assignedIds.has(s.id)) return false;
    const q = searchTerm.toLowerCase();
    return !q || s.student_code.toLowerCase().includes(q) ||
           s.student_name.toLowerCase().includes(q) ||
           (s.class_name && s.class_name.toLowerCase().includes(q));
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Quản Lý Thí Sinh Ca Thi: <span className="text-blue-600 font-mono">{session.session_code}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {session.title} • Đề: {session.exam_title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
              Đã phân công: <strong className="text-emerald-600">{assignedStudents.length}</strong> thí sinh
            </span>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'roster'
                ? 'text-blue-600 border-blue-600 bg-white'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Danh Sách Trong Ca ({assignedStudents.length})
          </button>
          <button
            onClick={() => setActiveTab('by_class')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'by_class'
                ? 'text-blue-600 border-blue-600 bg-white'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <School className="w-4 h-4" /> + Thêm Theo Lớp Học
          </button>
          <button
            onClick={() => setActiveTab('individual')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'individual'
                ? 'text-blue-600 border-blue-600 bg-white'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" /> + Chọn Từng Thí Sinh ({availableStudents.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: DANH SÁCH THÍ SINH TRONG CA */}
          {activeTab === 'roster' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm theo SBD, họ tên hoặc lớp..."
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 text-xs shadow-2xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {assignedStudents.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa toàn bộ khỏi ca thi
                  </button>
                )}
              </div>

              {assignedStudents.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 p-8 space-y-3 shadow-2xs">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Chưa phân công học sinh cho ca thi này</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Khi chưa phân công thí sinh, ca thi đang ở chế độ tự do (mọi học sinh có SBD đều có thể vào thi).
                    Hãy chuyển sang tab <strong>"Thêm Theo Lớp Học"</strong> để chỉ định chính xác thí sinh được phép thi.
                  </p>
                  <button
                    onClick={() => setActiveTab('by_class')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                  >
                    <School className="w-4 h-4" /> Thêm Thí Sinh Theo Lớp Ngay
                  </button>
                </div>
              ) : filteredAssigned.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic">
                  Không tìm thấy thí sinh nào khớp với từ khóa tìm kiếm.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3">Số Báo Danh</th>
                        <th className="p-3">Họ và Tên</th>
                        <th className="p-3">Ngày Sinh</th>
                        <th className="p-3">Lớp</th>
                        <th className="p-3 text-center">Trạng Thái Làm Bài</th>
                        <th className="p-3 text-center">Điểm Thi</th>
                        <th className="p-3 text-center w-16">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredAssigned.map((s, idx) => {
                        let statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Chưa vào phòng
                          </span>
                        );
                        if (s.attempt_status === 'waiting') {
                          statusBadge = (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              🟡 Trong phòng chờ
                            </span>
                          );
                        } else if (s.attempt_status === 'in_progress') {
                          statusBadge = (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              🔵 Đang làm bài
                            </span>
                          );
                        } else if (s.attempt_status === 'submitted' || s.attempt_status === 'forced_submitted') {
                          statusBadge = (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              🟢 Đã nộp bài
                            </span>
                          );
                        }

                        return (
                          <tr key={s.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 text-center text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-blue-600">{s.student_code}</td>
                            <td className="p-3 font-semibold text-slate-900">{s.student_name}</td>
                            <td className="p-3 text-slate-500 font-mono text-xs">{s.dob || '-'}</td>
                            <td className="p-3">{s.class_name || '-'}</td>
                            <td className="p-3 text-center">{statusBadge}</td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {s.attempt_status === 'submitted' || s.attempt_status === 'forced_submitted'
                                ? `${s.total_score}đ`
                                : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleRemoveStudent(s.id, s.student_name)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Xóa khỏi ca thi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: THÊM THEO LỚP HỌC */}
          {activeTab === 'by_class' && (
            <div className="space-y-6 max-w-xl mx-auto py-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                    <School className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-base">Thêm Toàn Bộ Học Sinh Của Lớp Vào Ca</h4>
                    <p className="text-xs text-slate-500">Chọn lớp từ danh mục để phân công thi</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Chọn Lớp Học:
                  </label>
                  <select
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm focus:border-blue-500 focus:outline-none shadow-2xs"
                  >
                    {classes.map(c => {
                      const countInClass = allStudents.filter(s => s.class_name === c).length;
                      return (
                        <option key={c} value={c}>
                          Lớp {c} ({countInClass} học sinh)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    disabled={submitting || !selectedClass}
                    onClick={handleAddByClass}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    {submitting ? 'Đang thêm học sinh...' : `Thêm Tất Cả Học Sinh Lớp ${selectedClass} Vào Ca Thi`}
                  </button>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-2.5 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Cơ chế bảo mật ca thi:</strong> Khi bạn đã thêm thí sinh vào ca thi, hệ thống sẽ tự động bật chế độ kiểm soát chặt chẽ. Chỉ những học sinh có tên trong danh sách lớp mới được phép đăng nhập. Các học sinh ngoài danh sách sẽ bị từ chối truy cập.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHỌN TỪNG THÍ SINH */}
          {activeTab === 'individual' && (
            <div className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Tìm học sinh chưa có trong ca thi..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 text-xs shadow-2xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {availableStudents.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs italic">
                  Tất cả học sinh trong hệ thống đã được phân công vào ca thi này hoặc không tìm thấy kết quả phù hợp.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-[50vh] overflow-y-auto shadow-2xs">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Số Báo Danh</th>
                        <th className="p-3">Họ và Tên</th>
                        <th className="p-3">Ngày Sinh</th>
                        <th className="p-3">Lớp</th>
                        <th className="p-3">Giới Tính</th>
                        <th className="p-3 text-center w-24">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {availableStudents.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono font-bold text-blue-600">{s.student_code}</td>
                          <td className="p-3 font-semibold text-slate-900">{s.student_name}</td>
                          <td className="p-3 text-slate-500 font-mono text-xs">{s.dob || '-'}</td>
                          <td className="p-3">{s.class_name || '-'}</td>
                          <td className="p-3">{s.gender || '-'}</td>
                          <td className="p-3 text-center">
                            <button
                              disabled={submitting}
                              onClick={() => handleAddSingleStudent(s.id)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              + Thêm
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex justify-end shrink-0 bg-slate-50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition shadow-2xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

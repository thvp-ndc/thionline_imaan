import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit2, X, Check, AlertCircle, Layers, FolderPlus, Save } from 'lucide-react';

export default function SubjectManagerModal({ isOpen, onClose, onSubjectsChanged, activeGradeId }) {
  if (!isOpen) return null;

  const [subjects, setSubjects] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form thêm / sửa
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    grade_ids: []
  });

  const fetchSubjectsAndGrades = async () => {
    try {
      setLoading(true);
      const [resS, resG] = await Promise.all([
        fetch('/api/curriculum/subjects').then(r => r.json()),
        fetch('/api/curriculum/grades').then(r => r.json())
      ]);

      if (resS.success) setSubjects(resS.subjects || []);
      if (resG.success) setGrades(resG.grades || []);
    } catch (err) {
      setError('Lỗi tải dữ liệu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjectsAndGrades();
  }, [isOpen]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      grade_ids: activeGradeId ? [activeGradeId] : grades.map(g => g.id)
    });
    setError('');
  };

  const handleStartAdd = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleStartEdit = (sub) => {
    setIsEditing(true);
    setEditingId(sub.id);
    setFormData({
      name: sub.name,
      code: sub.code || '',
      description: sub.description || '',
      grade_ids: []
    });
    setError('');
  };

  const handleToggleGrade = (gradeId) => {
    setFormData(prev => {
      const exists = prev.grade_ids.includes(gradeId);
      return {
        ...prev,
        grade_ids: exists
          ? prev.grade_ids.filter(id => id !== gradeId)
          : [...prev.grade_ids, gradeId]
      };
    });
  };

  const handleSelectAllGrades = (type = 'all') => {
    if (type === 'all') {
      setFormData(prev => ({ ...prev, grade_ids: grades.map(g => g.id) }));
    } else if (type === 'thcs') {
      setFormData(prev => ({ ...prev, grade_ids: grades.filter(g => g.level_type === 'thcs').map(g => g.id) }));
    } else if (type === 'thpt') {
      setFormData(prev => ({ ...prev, grade_ids: grades.filter(g => g.level_type === 'thpt').map(g => g.id) }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên môn học');
      return;
    }

    try {
      setError('');
      if (editingId) {
        // Cập nhật
        const res = await fetch(`/api/curriculum/subjects/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            code: formData.code,
            description: formData.description
          })
        });
        const data = await res.json();
        if (data.success) {
          setSuccess('Cập nhật môn học thành công!');
          setTimeout(() => setSuccess(''), 2500);
          resetForm();
          fetchSubjectsAndGrades();
          if (onSubjectsChanged) onSubjectsChanged();
        } else {
          setError(data.message || 'Lỗi cập nhật môn học');
        }
      } else {
        // Thêm mới
        const res = await fetch('/api/curriculum/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
          setSuccess(`Đã thêm môn "${formData.name}" thành công!`);
          setTimeout(() => setSuccess(''), 2500);
          resetForm();
          fetchSubjectsAndGrades();
          if (onSubjectsChanged) onSubjectsChanged(data.subject.id);
        } else {
          setError(data.message || 'Lỗi thêm môn học mới');
        }
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ: ' + err.message);
    }
  };

  const handleDelete = async (sub) => {
    if (sub.question_count > 0) {
      alert(`Không thể xóa môn "${sub.name}" vì đang có ${sub.question_count} câu hỏi trong ngân hàng!`);
      return;
    }
    if (!window.confirm(`Thầy/Cô có chắc chắn muốn xóa môn "${sub.name}" khỏi hệ thống?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/curriculum/subjects/${sub.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Đã xóa môn "${sub.name}"`);
        setTimeout(() => setSuccess(''), 2500);
        fetchSubjectsAndGrades();
        if (onSubjectsChanged) onSubjectsChanged();
      } else {
        alert(data.message || 'Lỗi xóa môn học');
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Quản Lý Danh Mục Môn Học
              </h3>
              <p className="text-xs text-slate-500">
                Thêm, sửa các môn học theo chuẩn GDPT 2018 (KHTN, LSDL, GDCD, Công nghệ...) cho các khối lớp.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo */}
        {error && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{success}</span>
          </div>
        )}

        {/* Nội dung chính */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Form thêm / sửa (ẩn hiện) */}
          {isEditing ? (
            <form onSubmit={handleSave} className="bg-slate-50 border border-blue-200 rounded-xl p-4 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-blue-700 uppercase flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  {editingId ? 'Chỉnh Sửa Môn Học' : 'Thêm Môn Học Mới Vào Hệ Thống'}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer font-medium"
                >
                  Đóng Form
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Tên Môn Học (*):
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ví dụ: Khoa học tự nhiên (KHTN), Hoạt động trải nghiệm..."
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none font-semibold shadow-2xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Mã Viết Tắt (Code):
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Ví dụ: KHTN, LSDL, GDCD, HĐTN..."
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none uppercase font-mono shadow-2xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Mô Tả / Ghi Chú:
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ví dụ: Môn tích hợp Vật lí, Hóa học, Sinh học cấp THCS"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none shadow-2xs"
                  />
                </div>

                {!editingId && (
                  <div className="sm:col-span-2 space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">
                        Khối Lớp Áp Dụng:
                      </label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleSelectAllGrades('thcs')}
                          className="text-teal-600 hover:underline font-semibold cursor-pointer"
                        >
                          Cấp THCS (6-9)
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSelectAllGrades('thpt')}
                          className="text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Cấp THPT (10-12)
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleSelectAllGrades('all')}
                          className="text-amber-600 hover:underline font-semibold cursor-pointer"
                        >
                          Tất Cả
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {grades.map(g => {
                        const checked = formData.grade_ids.includes(g.id);
                        return (
                          <button
                            type="button"
                            key={g.id}
                            onClick={() => handleToggleGrade(g.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              checked
                                ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {editingId ? 'Cập Nhật' : 'Lưu Môn Học Mới'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Tổng số môn học hiện có: <strong className="text-slate-900">{subjects.length}</strong>
              </span>
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Bổ Sung Môn Học Mới
              </button>
            </div>
          )}

          {/* Danh sách các Môn học */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {subjects.map(sub => {
                const isThcsSubject = ['khtn', 'ls_dl', 'gdcd'].includes(sub.id);
                return (
                  <div
                    key={sub.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                      isThcsSubject
                        ? 'bg-teal-50/40 border-teal-200'
                        : 'bg-white border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {sub.name}
                        </span>
                        {sub.code && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200 font-semibold">
                            {sub.code}
                          </span>
                        )}
                        {isThcsSubject && (
                          <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold border border-teal-200">
                            THCS (K6-9)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span>📊 {sub.question_count || 0} câu hỏi trong kho</span>
                        {sub.description && (
                          <span className="truncate max-w-[180px] text-slate-400">
                            • {sub.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(sub)}
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
                        title="Chỉnh sửa tên / mã môn"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sub)}
                        className={`p-1.5 rounded-lg border transition ${
                          sub.question_count > 0
                            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                            : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border-slate-200 cursor-pointer shadow-2xs'
                        }`}
                        title={sub.question_count > 0 ? 'Môn đang có câu hỏi, không thể xóa' : 'Xóa môn học'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

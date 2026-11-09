import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, FolderTree, BookOpen, FileText, CheckCircle2, AlertCircle, X as CloseIcon, Upload, ArrowRight, Layers } from 'lucide-react';

export default function TopicLessonManagerModal({
  isOpen,
  onClose,
  gradeSubject,
  onCurriculumChanged
}) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState(null);

  // Sub-tabs: 'tree' | 'import_text'
  const [activeTab, setActiveTab] = useState('tree');

  // Form thêm / sửa Chủ đề
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [topicForm, setTopicForm] = useState({ code: '', name: '', description: '' });

  // Form thêm / sửa Bài học
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [lessonForm, setLessonForm] = useState({
    code: '',
    name: '',
    objectives: '',
    objectives_by_level: { biet: '', hieu: '', van_dung: '' }
  });

  // Text import
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchTopics = async () => {
    if (!gradeSubject?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/curriculum/topics?grade_subject_id=${gradeSubject.id}`);
      const data = await res.json();
      if (data.success) {
        setTopics(data.topics || []);
        if (data.topics.length > 0 && !selectedTopicId) {
          setSelectedTopicId(data.topics[0].id);
        }
      }
    } catch (err) {
      console.error('Fetch topics error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && gradeSubject?.id) {
      fetchTopics();
    }
  }, [isOpen, gradeSubject?.id]);

  if (!isOpen) return null;

  const currentTopic = topics.find(t => t.id === selectedTopicId) || topics[0] || null;

  // --- TOPIC ACTIONS ---
  const handleOpenCreateTopic = () => {
    setEditingTopicId(null);
    setTopicForm({ code: `CD_${topics.length + 1}`, name: '', description: '' });
    setShowTopicForm(true);
  };

  const handleOpenEditTopic = (t) => {
    setEditingTopicId(t.id);
    setTopicForm({ code: t.code || '', name: t.name || '', description: t.description || '' });
    setShowTopicForm(true);
  };

  const handleSaveTopic = async (e) => {
    e.preventDefault();
    if (!topicForm.name.trim()) return alert('Vui lòng nhập tên chủ đề');

    try {
      const url = editingTopicId ? `/api/curriculum/topics/${editingTopicId}` : '/api/curriculum/topics';
      const method = editingTopicId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade_subject_id: gradeSubject.id,
          ...topicForm
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowTopicForm(false);
        await fetchTopics();
        if (!editingTopicId && data.topic) {
          setSelectedTopicId(data.topic.id);
        }
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi lưu chủ đề: ' + err.message);
    }
  };

  const handleDeleteTopic = async (topicId, topicName) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa chủ đề "${topicName}"?\nCác bài học và câu hỏi thuộc chủ đề này sẽ bị xóa khỏi hệ thống.`)) return;

    try {
      const res = await fetch(`/api/curriculum/topics/${topicId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (selectedTopicId === topicId) setSelectedTopicId(null);
        await fetchTopics();
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi xóa chủ đề: ' + err.message);
    }
  };

  // --- LESSON ACTIONS ---
  const handleOpenCreateLesson = () => {
    if (!currentTopic) return alert('Vui lòng chọn một chủ đề trước');
    const lessonCount = currentTopic.lessons ? currentTopic.lessons.length : 0;
    setEditingLessonId(null);
    setLessonForm({
      code: `BAI_${lessonCount + 1}`,
      name: '',
      objectives: '',
      objectives_by_level: { biet: '', hieu: '', van_dung: '' }
    });
    setShowLessonForm(true);
  };

  const handleOpenEditLesson = (l) => {
    setEditingLessonId(l.id);
    let byLevel = { biet: '', hieu: '', van_dung: '' };
    if (l.objectives_by_level_json) {
      try {
        const parsed = typeof l.objectives_by_level_json === 'string'
          ? JSON.parse(l.objectives_by_level_json)
          : l.objectives_by_level_json;
        if (parsed && typeof parsed === 'object') {
          byLevel.biet = parsed.biet || '';
          byLevel.hieu = parsed.hieu || '';
          byLevel.van_dung = parsed.van_dung || parsed.vd || '';
        }
      } catch (e) {}
    }

    setLessonForm({
      code: l.code || '',
      name: l.name || '',
      objectives: l.objectives || '',
      objectives_by_level: byLevel
    });
    setShowLessonForm(true);
  };

  const handleSaveLesson = async (e) => {
    e.preventDefault();
    if (!lessonForm.name.trim()) return alert('Vui lòng nhập tên bài học');

    try {
      const url = editingLessonId ? `/api/curriculum/lessons/${editingLessonId}` : '/api/curriculum/lessons';
      const method = editingLessonId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: currentTopic.id,
          code: lessonForm.code,
          name: lessonForm.name,
          objectives: lessonForm.objectives,
          objectives_by_level_json: JSON.stringify(lessonForm.objectives_by_level)
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowLessonForm(false);
        await fetchTopics();
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi lưu bài học: ' + err.message);
    }
  };

  const handleDeleteLesson = async (lessonId, lessonName) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa bài học "${lessonName}"?`)) return;

    try {
      const res = await fetch(`/api/curriculum/lessons/${lessonId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchTopics();
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi xóa bài học: ' + err.message);
    }
  };

  // --- TEXT IMPORT ---
  const handleImportText = async () => {
    if (!importText.trim()) return alert('Vui lòng dán danh sách chủ đề và bài học');
    try {
      setImporting(true);
      const res = await fetch('/api/curriculum/import-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade_subject_id: gradeSubject.id,
          text_content: importText
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setImportText('');
        setActiveTab('tree');
        await fetchTopics();
        if (onCurriculumChanged) onCurriculumChanged();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi nhập văn bản: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Quản Lý Chủ Đề & Bài Học
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">
                  {gradeSubject.grade_name} - {gradeSubject.subject_name}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Tổ chức cây tri thức giúp phân loại câu hỏi và sinh đề thi chuẩn theo ma trận.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('tree')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'tree' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cây Danh Mục
              </button>
              <button
                onClick={() => setActiveTab('import_text')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'import_text' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" /> Nhập Văn Bản
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'tree' && (
            <div className="flex-1 flex overflow-hidden">
              {/* CỘT TRÁI: DANH SÁCH CHỦ ĐỀ */}
              <div className="w-2/5 border-r border-slate-200 flex flex-col bg-slate-50/50">
                <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Chủ Đề / Chương ({topics.length})
                  </span>
                  <button
                    onClick={handleOpenCreateTopic}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Thêm Chủ Đề
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {loading ? (
                    <p className="text-xs text-slate-500 italic p-3">Đang tải danh mục...</p>
                  ) : topics.length === 0 ? (
                    <div className="text-center py-8 px-4 text-slate-500 text-xs">
                      Chưa có chủ đề nào. Hãy bấm "Thêm Chủ Đề" hoặc chọn tab "Nhập Văn Bản".
                    </div>
                  ) : (
                    topics.map(t => {
                      const isSelected = t.id === (currentTopic?.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTopicId(t.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between group ${
                            isSelected
                              ? 'bg-blue-50/90 border-blue-400 text-slate-900 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              {t.code && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                  isSelected ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {t.code}
                                </span>
                              )}
                              <span className="text-xs font-bold truncate block">{t.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-medium">
                              <span>📚 {t.lesson_count || 0} bài học</span>
                              <span className="text-blue-600">❓ {t.question_count || 0} câu hỏi</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditTopic(t);
                              }}
                              className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded transition cursor-pointer"
                              title="Sửa chủ đề"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTopic(t.id, t.name);
                              }}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Xóa chủ đề"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: DANH SÁCH BÀI HỌC THUỘC CHỦ ĐỀ ĐANG CHỌN */}
              <div className="flex-1 flex flex-col bg-white">
                {currentTopic ? (
                  <>
                    <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          {currentTopic.name}
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          Danh sách các bài học thuộc chủ đề này
                        </span>
                      </div>
                      <button
                        onClick={handleOpenCreateLesson}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Thêm Bài Học
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {/* Mục câu hỏi chưa phân loại vào bài học cụ thể (câu hỏi chung của chủ đề) */}
                      {currentTopic.unassigned_question_count > 0 && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between shadow-2xs">
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                CHUNG
                              </span>
                              <span className="text-xs font-bold text-amber-900">
                                Câu hỏi chung của chủ đề (Chưa gán bài học cụ thể)
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-700/90 mt-1">
                              Các câu hỏi thuộc phạm vi kiến thức chung của chủ đề hoặc chưa chọn bài học khi tạo/nhập Word.
                            </p>
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-600 mt-1.5 font-medium">
                              <span>Tổng câu hỏi: <strong className="text-slate-900">{currentTopic.unassigned_question_count}</strong></span>
                              <span className="text-emerald-700 font-semibold">Biết: {currentTopic.unassigned_count_biet || 0}</span>
                              <span className="text-blue-700 font-semibold">Hiểu: {currentTopic.unassigned_count_hieu || 0}</span>
                              <span className="text-amber-700 font-semibold">Vận dụng: {currentTopic.unassigned_count_van_dung || 0}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {(!currentTopic.lessons || currentTopic.lessons.length === 0) ? (
                        currentTopic.unassigned_question_count > 0 ? null : (
                          <div className="text-center py-12 text-slate-500 text-xs">
                            Chủ đề này chưa có bài học nào. Bấm nút "+ Thêm Bài Học" để bắt đầu.
                          </div>
                        )
                      ) : (
                        currentTopic.lessons.map(les => (
                          <div
                            key={les.id}
                            className="p-3 bg-slate-50/80 hover:bg-slate-100/90 border border-slate-200 rounded-xl transition flex items-center justify-between group shadow-2xs"
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="flex items-center gap-2">
                                {les.code && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white text-emerald-700 border border-slate-200">
                                    {les.code}
                                  </span>
                                )}
                                <span className="text-xs font-bold text-slate-900">{les.name}</span>
                              </div>
                              {(() => {
                                let byLvl = null;
                                if (les.objectives_by_level_json) {
                                  try {
                                    byLvl = typeof les.objectives_by_level_json === 'string'
                                      ? JSON.parse(les.objectives_by_level_json)
                                      : les.objectives_by_level_json;
                                  } catch (e) {}
                                }
                                const hasBiet = Boolean(byLvl?.biet?.trim());
                                const hasHieu = Boolean(byLvl?.hieu?.trim());
                                const hasVd = Boolean(byLvl?.van_dung?.trim() || byLvl?.vd?.trim());

                                if (hasBiet || hasHieu || hasVd) {
                                  return (
                                    <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                                      <span className="text-slate-500 font-medium">Yêu cầu cần đạt:</span>
                                      {hasBiet && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">Biết</span>}
                                      {hasHieu && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Hiểu</span>}
                                      {hasVd && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">Vận dụng</span>}
                                    </div>
                                  );
                                }
                                if (les.objectives) {
                                  return <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{les.objectives}</p>;
                                }
                                return null;
                              })()}
                              <div className="flex items-center gap-2.5 text-[11px] text-slate-500 mt-1.5 font-medium">
                                <span>Tổng câu hỏi: <strong className="text-slate-900">{les.total_questions || 0}</strong></span>
                                <span className="text-emerald-700">Biết: {les.count_biet || 0}</span>
                                <span className="text-blue-700">Hiểu: {les.count_hieu || 0}</span>
                                <span className="text-amber-700">Vận dụng: {les.count_van_dung || 0}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => handleOpenEditLesson(les)}
                                className="p-1 hover:bg-white text-slate-500 hover:text-slate-800 rounded transition cursor-pointer shadow-2xs border border-transparent hover:border-slate-200"
                                title="Sửa bài học"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLesson(les.id, les.name)}
                                className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                title="Xóa bài học"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                    Vui lòng chọn hoặc tạo một chủ đề ở cột bên trái.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: NHẬP VĂN BẢN HÀNG LOẠT */}
          {activeTab === 'import_text' && (
            <div className="p-5 flex-1 flex flex-col space-y-3 bg-white">
              <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 text-xs text-slate-700 leading-relaxed">
                <strong className="text-blue-800 block mb-1 font-bold">💡 Hướng dẫn nhập nhanh danh mục từ đề cương / Word:</strong>
                Dán danh sách Chủ đề và Bài học theo định dạng phân cấp (Dòng chủ đề bắt đầu bằng <code>Chủ đề</code> hoặc <code>Chương</code> hoặc <code>#</code>; các dòng bài học bên dưới bắt đầu bằng <code>-</code> hoặc <code>Bài 1</code>):
                <pre className="mt-2 bg-slate-100 p-2.5 rounded-lg text-[11px] text-slate-800 border border-slate-200 font-mono">
{`Chủ đề 1: Máy tính và cộng đồng
- Bài 1: Thông tin và xử lý thông tin
- Bài 2: Vai trò của thiết bị thông minh
Chủ đề 2: Mạng máy tính và Internet
- Bài 3: Mạng máy tính trong cuộc sống hiện đại
- Bài 4: Thực hành kết nối mạng`}
                </pre>
              </div>

              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Dán nội dung danh sách chủ đề và bài học vào đây..."
                rows={10}
                className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono shadow-2xs"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setActiveTab('tree')}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleImportText}
                  disabled={importing || !importText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? 'Đang Xử Lý...' : 'Nhập Toàn Bộ Vào CSDL'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Thêm / Sửa Chủ Đề */}
        {showTopicForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                {editingTopicId ? 'Chỉnh Sửa Chủ Đề' : 'Thêm Chủ Đề / Chương Mới'}
              </h4>
              <form onSubmit={handleSaveTopic} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Mã Chủ Đề:</label>
                  <input
                    type="text"
                    value={topicForm.code}
                    onChange={e => setTopicForm({ ...topicForm, code: e.target.value })}
                    placeholder="VD: CD_A hoặc CHUONG_1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Tên Chủ Đề (*):</label>
                  <input
                    type="text"
                    value={topicForm.name}
                    onChange={e => setTopicForm({ ...topicForm, name: e.target.value })}
                    placeholder="VD: Chủ đề A: Máy tính và xã hội tri thức"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Mô Tả:</label>
                  <textarea
                    value={topicForm.description}
                    onChange={e => setTopicForm({ ...topicForm, description: e.target.value })}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowTopicForm(false)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                  >
                    Lưu Chủ Đề
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Thêm / Sửa Bài Học */}
        {showLessonForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-sm font-bold text-slate-900">
                  {editingLessonId ? 'Chỉnh Sửa Bài Học & Yêu Cầu Cần Đạt' : 'Thêm Bài Học Mới'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowLessonForm(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Thuộc chủ đề: <strong className="text-blue-700 font-bold">{currentTopic?.name}</strong>
              </p>

              <form onSubmit={handleSaveLesson} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Mã Bài Học:</label>
                    <input
                      type="text"
                      value={lessonForm.code}
                      onChange={e => setLessonForm({ ...lessonForm, code: e.target.value })}
                      placeholder="VD: BAI_1, BAI_2"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Tên Bài Học (*):</label>
                    <input
                      type="text"
                      value={lessonForm.name}
                      onChange={e => setLessonForm({ ...lessonForm, name: e.target.value })}
                      placeholder="VD: Bài 1: Thông tin và xử lí thông tin"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none font-semibold"
                      required
                    />
                  </div>
                </div>

                {/* Khung nhập Yêu cầu cần đạt 3 mức độ nhận thức */}
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      Yêu Cầu Cần Đạt (Chuẩn GDPT 2018)
                    </span>
                    <span className="text-[10px] text-slate-500 italic">
                      Nhập theo nhu cầu đánh giá (không bắt buộc điền cả 3 mức)
                    </span>
                  </div>

                  {/* 1. Nhận biết */}
                  <div>
                    <label className="block text-[11px] font-semibold text-blue-800 mb-0.5">
                      1. Mức độ Nhận biết:
                    </label>
                    <textarea
                      value={lessonForm.objectives_by_level.biet}
                      onChange={e => setLessonForm({
                        ...lessonForm,
                        objectives_by_level: { ...lessonForm.objectives_by_level, biet: e.target.value }
                      })}
                      placeholder="VD: Nêu được các khái niệm cơ bản, nhận biết và liệt kê được..."
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* 2. Thông hiểu */}
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-800 mb-0.5">
                      2. Mức độ Thông hiểu:
                    </label>
                    <textarea
                      value={lessonForm.objectives_by_level.hieu}
                      onChange={e => setLessonForm({
                        ...lessonForm,
                        objectives_by_level: { ...lessonForm.objectives_by_level, hieu: e.target.value }
                      })}
                      placeholder="VD: Giải thích được nguyên lý, phân biệt và so sánh được..."
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* 3. Vận dụng */}
                  <div>
                    <label className="block text-[11px] font-semibold text-purple-800 mb-0.5">
                      3. Mức độ Vận dụng:
                    </label>
                    <textarea
                      value={lessonForm.objectives_by_level.van_dung}
                      onChange={e => setLessonForm({
                        ...lessonForm,
                        objectives_by_level: { ...lessonForm.objectives_by_level, van_dung: e.target.value }
                      })}
                      placeholder="VD: Vận dụng kiến thức giải quyết tình huống thực tế, viết chương trình..."
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Mục tiêu bài học cũ / Ghi chú chung (Tương thích ngược) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Ghi Chú / Mục Tiêu Chung (Tùy chọn tương thích ngược):
                  </label>
                  <input
                    type="text"
                    value={lessonForm.objectives}
                    onChange={e => setLessonForm({ ...lessonForm, objectives: e.target.value })}
                    placeholder="Mục tiêu chung nếu có..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowLessonForm(false)}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs"
                  >
                    Lưu Bài Học
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

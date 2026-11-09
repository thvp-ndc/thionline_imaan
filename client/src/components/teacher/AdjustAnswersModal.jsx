import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, RefreshCw, Sliders, Check, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';
import MathContent from '../common/MathContent';
import { normalizeTrueFalseMap } from '../../utils/trueFalseHelper';

export default function AdjustAnswersModal({ sessionId, onClose, onRegraded }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [selectedQId, setSelectedQId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch session, overrides and master questions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/teacher/sessions/${sessionId}/answer-overrides`);
        const data = await res.json();
        if (data.success) {
          setSession(data.session);
          setQuestions(data.questions || []);
          setOverrides(data.overrides || {});
          if (data.questions && data.questions.length > 0) {
            setSelectedQId(data.questions[0].id);
          }
        } else {
          setErrorMsg(data.message || 'Không thể tải thông tin ca thi');
        }
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId]);

  const activeQ = questions.find(q => q.id === selectedQId);
  const currentOverride = activeQ ? (overrides[activeQ.id] || null) : null;

  const getInitialTfMap = (q) => {
    return normalizeTrueFalseMap(q?.correct_answers, 'F');
  };

  const handleSetOverrideAction = (actionType) => {
    if (!activeQ) return;
    setOverrides(prev => {
      const next = { ...prev };
      if (actionType === 'reset') {
        delete next[activeQ.id];
      } else if (actionType === 'full_credit') {
        next[activeQ.id] = {
          action: 'full_credit',
          question_content: activeQ.content,
          notes: prev[activeQ.id]?.notes || 'Hủy câu thi / Cho điểm tối đa toàn bộ thí sinh'
        };
      } else if (actionType === 'override_answer') {
        const isTf = activeQ.question_type === 'true_false';
        const firstOpt = activeQ.options?.[0];
        next[activeQ.id] = {
          action: 'override_answer',
          question_content: activeQ.content,
          correct_option_ids: firstOpt ? [firstOpt.id] : [],
          correct_option_texts: firstOpt ? [firstOpt.text] : [],
          correct_tf_map: isTf ? getInitialTfMap(activeQ) : undefined,
          notes: prev[activeQ.id]?.notes || (isTf ? 'Điều chỉnh đáp án Đúng/Sai từng ý' : 'Điều chỉnh đáp án chuẩn')
        };
      } else if (actionType === 'accept_multiple') {
        // Default to original correct answers
        const defaultIds = Array.isArray(activeQ.correct_answers) ? activeQ.correct_answers : [];
        const defaultTexts = (activeQ.options || [])
          .filter(o => defaultIds.includes(o.id))
          .map(o => o.text);

        next[activeQ.id] = {
          action: 'accept_multiple',
          question_content: activeQ.content,
          correct_option_ids: defaultIds,
          correct_option_texts: defaultTexts,
          notes: prev[activeQ.id]?.notes || 'Chấp nhận đồng thời nhiều đáp án'
        };
      }
      return next;
    });
  };

  const handleToggleTfSubItem = (subKey, val) => {
    if (!activeQ) return;
    setOverrides(prev => {
      const current = prev[activeQ.id] || {
        action: 'override_answer',
        question_content: activeQ.content,
        correct_tf_map: getInitialTfMap(activeQ),
        notes: 'Điều chỉnh đáp án Đúng/Sai từng ý'
      };
      const currentMap = current.correct_tf_map || getInitialTfMap(activeQ);
      return {
        ...prev,
        [activeQ.id]: {
          ...current,
          action: 'override_answer',
          question_content: activeQ.content,
          correct_tf_map: {
            ...currentMap,
            [subKey.toLowerCase()]: val
          }
        }
      };
    });
  };

  const handleToggleOptionInOverride = (opt) => {
    if (!activeQ) return;
    setOverrides(prev => {
      const current = prev[activeQ.id] || {
        action: 'override_answer',
        correct_option_ids: [],
        correct_option_texts: [],
        notes: ''
      };

      const isMultiple = current.action === 'accept_multiple';
      let newIds = [];
      let newTexts = [];

      if (isMultiple) {
        const idSet = new Set(current.correct_option_ids || []);
        if (idSet.has(opt.id)) {
          idSet.delete(opt.id);
        } else {
          idSet.add(opt.id);
        }
        newIds = Array.from(idSet);
        newTexts = (activeQ.options || [])
          .filter(o => idSet.has(o.id))
          .map(o => o.text);
      } else {
        // Single choice override
        newIds = [opt.id];
        newTexts = [opt.text];
      }

      return {
        ...prev,
        [activeQ.id]: {
          ...current,
          correct_option_ids: newIds,
          correct_option_texts: newTexts
        }
      };
    });
  };

  const handleNotesChange = (text) => {
    if (!activeQ) return;
    setOverrides(prev => {
      const current = prev[activeQ.id] || { action: 'override_answer', correct_option_ids: [], correct_option_texts: [] };
      return {
        ...prev,
        [activeQ.id]: {
          ...current,
          notes: text
        }
      };
    });
  };

  // Submit regrade
  const handleRegradeSession = async () => {
    const overrideCount = Object.keys(overrides).length;
    const confirmMsg = overrideCount > 0
      ? `Hệ thống sẽ áp dụng ${overrideCount} câu hỏi được điều chỉnh và chấm lại toàn bộ bài làm của tất cả thí sinh trong ca thi này (kể cả đề xáo trộn). Bạn có chắc chắn muốn thực hiện?`
      : 'Bạn đang xóa toàn bộ điều chỉnh và chấm lại ca thi theo đáp án gốc của đề. Bạn có chắc chắn?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setSaving(true);
      setErrorMsg('');
      const res = await fetch(`/api/teacher/sessions/${sessionId}/regrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides })
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccessMsg(json.message);
        if (onRegraded) onRegraded();
        setTimeout(() => {
          setSaveSuccessMsg('');
        }, 4000);
      } else {
        setErrorMsg(json.message || 'Lỗi khi chấm lại ca thi');
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const overriddenQuestionCount = Object.keys(overrides).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-800">
                  Điều Chỉnh Đáp Án Ca Thi & Chấm Lại
                </h2>
                {overriddenQuestionCount > 0 && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                    Đã sửa {overriddenQuestionCount} câu
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Mã ca: <strong className="text-blue-600 font-mono">{session?.session_code}</strong> | {session?.title}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notices */}
        {saveSuccessMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Body (2 cols) */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Đang tải dữ liệu ca thi và ngân hàng câu hỏi...
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            {/* Left Col: Question List (4 cols) */}
            <div className="md:col-span-4 border-r border-slate-200 bg-slate-50 p-3 overflow-y-auto space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 flex items-center justify-between">
                <span>Danh sách câu hỏi ({questions.length})</span>
                <span className="text-[10px] text-slate-400">Click chọn để sửa</span>
              </div>

              {questions.map((q, idx) => {
                const isSelected = q.id === selectedQId;
                const isOverridden = Boolean(overrides[q.id]);
                const ov = overrides[q.id];

                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQId(q.id)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-start justify-between gap-2 text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-500 text-slate-900 shadow-2xs font-medium'
                        : isOverridden
                        ? 'bg-amber-50/60 border-amber-300 text-amber-900 hover:bg-amber-50'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <span className="text-blue-600 font-mono">Câu {idx + 1}</span>
                        <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-normal border border-slate-200">
                          {q.question_type === 'essay' ? 'Tự luận' : q.question_type === 'true_false' ? 'Đúng/Sai' : 'Trắc nghiệm'}
                        </span>
                        {q.student_occurrences && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 font-medium border border-teal-200">
                            {q.student_occurrences} bài thi
                          </span>
                        )}
                      </div>
                      <div className="truncate text-slate-500 text-[11px]">
                        {q.content.replace(/<[^>]*>?/gm, '').slice(0, 60)}...
                      </div>
                    </div>

                    {isOverridden && (
                      <span className="shrink-0 px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold">
                        {ov.action === 'full_credit' ? 'Cho điểm' : ov.action === 'accept_multiple' ? 'Nhiều ĐA' : 'Đổi ĐA'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Col: Question Detail & Override Controls (8 cols) */}
            {activeQ ? (
              <div className="md:col-span-8 p-5 overflow-y-auto flex flex-col justify-between space-y-6 bg-white">
                <div className="space-y-4">
                  {/* Active Question Info */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs">
                      <span className="font-bold text-blue-600 font-mono text-sm">
                        CÂU HỎI {questions.findIndex(q => q.id === activeQ.id) + 1} {activeQ.student_occurrences ? `(Có trong ${activeQ.student_occurrences} bài thi thí sinh)` : '(Đề Gốc)'}
                      </span>
                      <span className="text-slate-500">Thang điểm: {activeQ.max_score} điểm</span>
                    </div>
                    <div className="text-sm text-slate-800 leading-relaxed font-medium">
                      <MathContent content={activeQ.content} />
                    </div>
                  </div>

                  {/* Mode Action Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-slate-600">
                      Chọn Hành Động Điều Chỉnh Cho Ca Thi Này:
                    </label>
                    <div className={`grid gap-2 ${activeQ.question_type === 'true_false' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                      <button
                        type="button"
                        onClick={() => handleSetOverrideAction('override_answer')}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                          currentOverride?.action === 'override_answer'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                        }`}
                      >
                        <span>🔄 {activeQ.question_type === 'true_false' ? 'Sửa Đáp Án Đúng/Sai' : 'Đổi Đáp Án Đúng'}</span>
                        <span className="text-[10px] font-normal opacity-80">
                          {activeQ.question_type === 'true_false' ? 'Chỉnh T/F từng ý a, b, c, d' : 'Chọn 1 phương án mới'}
                        </span>
                      </button>

                      {activeQ.question_type !== 'true_false' && (
                        <button
                          type="button"
                          onClick={() => handleSetOverrideAction('accept_multiple')}
                          className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                            currentOverride?.action === 'accept_multiple'
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                          }`}
                        >
                          <span>☑️ Chấp Nhận Nhiều ĐA</span>
                          <span className="text-[10px] font-normal opacity-80">Học sinh chọn 1 trong số đó đều đúng</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSetOverrideAction('full_credit')}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                          currentOverride?.action === 'full_credit'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                        }`}
                      >
                        <span>🎁 Hủy Câu / Cho Điểm</span>
                        <span className="text-[10px] font-normal opacity-80">Cộng tối đa cho toàn bộ thí sinh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetOverrideAction('reset')}
                        disabled={!currentOverride}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                          !currentOverride
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100 shadow-2xs'
                        }`}
                      >
                        <span>↩️ Khôi Phục Gốc</span>
                        <span className="text-[10px] font-normal opacity-80">Dùng đáp án ban đầu của đề</span>
                      </button>
                    </div>
                  </div>

                  {/* Options selection if override_answer or accept_multiple */}
                  {currentOverride && (currentOverride.action === 'override_answer' || currentOverride.action === 'accept_multiple') && (
                    <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fadeIn">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>
                          {activeQ.question_type === 'true_false'
                            ? 'Chọn trạng thái Đúng (T) hoặc Sai (F) cho từng ý dưới đây:'
                            : currentOverride.action === 'override_answer'
                            ? 'Bấm chọn DUY NHẤT 1 phương án làm đáp án đúng mới:'
                            : 'Bấm tích chọn CÁC phương án được chấp nhận cho điểm:'}
                        </span>
                        <span className="text-[11px] text-amber-700 font-semibold">
                          (Hệ thống tự đối chiếu sang đề của từng thí sinh)
                        </span>
                      </div>

                      {activeQ.question_type === 'true_false' ? (
                        <div className="space-y-2.5 mt-2">
                          {(activeQ.options || []).map((opt) => {
                            const subKey = String(opt.id).toLowerCase();
                            const origMap = getInitialTfMap(activeQ);
                            const origVal = origMap[subKey] || 'F';
                            const curMap = currentOverride.correct_tf_map || origMap;
                            const curVal = curMap[subKey] || origVal;

                            return (
                              <div
                                key={opt.id}
                                className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200 uppercase mt-0.5">
                                    {opt.id}
                                  </span>
                                  <div className="text-xs text-slate-800 leading-relaxed font-medium">
                                    <MathContent content={opt.text} />
                                    <span className="ml-2 inline-block text-[10px] text-slate-400 font-normal">
                                      (Gốc: <strong className={origVal === 'T' ? 'text-emerald-600' : 'text-rose-600'}>{origVal === 'T' ? 'Đúng' : 'Sai'}</strong>)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTfSubItem(subKey, 'T')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                      curVal === 'T'
                                        ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {curVal === 'T' && <Check className="w-3.5 h-3.5" />}
                                    Đúng (T)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTfSubItem(subKey, 'F')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                      curVal === 'F'
                                        ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {curVal === 'F' && <Check className="w-3.5 h-3.5" />}
                                    Sai (F)
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2 mt-2">
                          {(activeQ.options || []).map((opt) => {
                            const isOriginalCorrect = (activeQ.correct_answers || []).includes(opt.id);
                            const isNewCorrect = (currentOverride.correct_option_ids || []).includes(opt.id);

                            return (
                              <div
                                key={opt.id}
                                onClick={() => handleToggleOptionInOverride(opt)}
                                className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 text-xs shadow-2xs ${
                                  isNewCorrect
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                                    isNewCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {opt.id}
                                  </span>
                                  <span>{opt.text}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {isOriginalCorrect && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] border border-slate-200">
                                      (Đáp án gốc)
                                    </span>
                                  )}
                                  {isNewCorrect ? (
                                    <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] flex items-center gap-1 shadow-2xs">
                                      <Check className="w-3 h-3" /> Được chọn
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                                      Chọn
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes / Lý do điều chỉnh */}
                  {currentOverride && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-600">
                        Lý do điều chỉnh (ghi chú nội bộ):
                      </label>
                      <input
                        type="text"
                        value={currentOverride.notes || ''}
                        onChange={e => handleNotesChange(e.target.value)}
                        placeholder="Ví dụ: Đề in thiếu dữ kiện / Thừa đáp án đúng / Đổi từ A sang B..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                      />
                    </div>
                  )}
                </div>

                {/* Bottom Action Notice */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      Khi nhấn nút bên phải, hệ thống sẽ <strong>tính toán lại điểm tự động</strong> cho tất cả thí sinh ca này trong tích tắc.
                    </span>
                  </div>

                  <button
                    onClick={handleRegradeSession}
                    disabled={saving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-2xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                    {saving ? 'Đang chấm lại ca thi...' : 'Lưu & Chấm Lại Ca Thi Ngay'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="md:col-span-8 p-12 text-center text-slate-400 text-sm">
                Vui lòng chọn một câu hỏi ở danh sách bên trái để xem và sửa đáp án.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

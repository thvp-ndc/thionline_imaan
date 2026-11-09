import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Trash2, X as CloseIcon, Sigma, Code2, Image as ImageIcon,
  CheckCircle2, HelpCircle, AlertCircle, AlertTriangle, Save, Maximize2,
  Minimize2, Loader2, ChevronDown, ChevronRight, Eye, Edit3, Sparkles
} from 'lucide-react';
import RichQuestionEditor from '../editor/RichQuestionEditor';
import MathContent from '../common/MathContent';
import { normalizeQuestion, deepCloneQuestion } from '../../utils/questionAdapter';
import { getTrueFalseState, isTrueFalseOptionCorrect, normalizeTrueFalseMap } from '../../utils/trueFalseHelper';

export default function QuestionBankEditorModal({
  isOpen,
  onClose,
  gradeSubject,
  editingQuestionId = null,
  onSaved,
  mode = 'bank', // 'bank' | 'exam_question'
  initialQuestionData = null,
  onApplyToExam = null
}) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'preview'
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [newAnswerInput, setNewAnswerInput] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState('');

  const [form, setForm] = useState({
    topic_id: '',
    lesson_id: '',
    level: 'biet',
    question_type: 'single_choice',
    content: '',
    options: [
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' }
    ],
    correct_answers: ['A'],
    short_answer: '',
    scoring_config: {
      allow_comma_dot_equivalence: true,
      case_sensitive: false,
      trim_whitespace: true,
      numeric_equivalence: false,
      answer_format: 'decimal',
      max_characters: null
    },
    rubric_guide: '',
    default_score: 0.25
  });

  // Theo dõi trạng thái đã thay đổi (isDirty)
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    try {
      const current = JSON.stringify({
        content: form.content,
        question_type: form.question_type,
        options: form.options,
        correct_answers: form.correct_answers,
        short_answer: form.short_answer,
        scoring_config: form.scoring_config,
        rubric_guide: form.rubric_guide,
        default_score: form.default_score
      });
      return current !== initialSnapshot;
    } catch (e) {
      return false;
    }
  }, [form, initialSnapshot]);

  const handleRequestClose = () => {
    if (isDirty) {
      const confirmed = window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng và hủy bỏ?');
      if (!confirmed) return;
    }
    onClose();
  };

  // Trạng thái kiểm soát trùng lặp
  const [bankDuplicate, setBankDuplicate] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Tính toán các cặp phương án bị trùng lặp (Intra-Question Duplicates)
  const optionDuplicatePairs = useMemo(() => {
    if (!form.options || form.options.length < 2) return [];
    if (form.question_type !== 'single_choice' && form.question_type !== 'true_false') return [];

    const map = [];
    form.options.forEach(opt => {
      const text = (opt.text || '').replace(/<[^>]+>/g, '').trim();
      if (!text) return;
      const norm = text
        .toLowerCase()
        .replace(/^\$[^\$]+\$$/g, m => m.slice(1, -1))
        .replace(/\s+/g, ' ')
        .replace(/[.:;,!?]+$/, '')
        .trim();
      map.push({ id: opt.id, norm });
    });

    const duplicates = [];
    for (let i = 0; i < map.length; i++) {
      for (let j = i + 1; j < map.length; j++) {
        if (map[i].norm && map[i].norm === map[j].norm) {
          duplicates.push({ id1: map[i].id, id2: map[j].id });
        }
      }
    }
    return duplicates;
  }, [form.options, form.question_type]);

  // Debounced kiểm tra câu hỏi trùng với ngân hàng đề
  useEffect(() => {
    if (mode === 'exam_question') {
      setBankDuplicate(null);
      return;
    }
    const rawContent = (form.content || '').replace(/<[^>]+>/g, '').trim();
    if (rawContent.length < 12 || !gradeSubject?.id) {
      setBankDuplicate(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingDuplicate(true);
        const res = await fetch('/api/question-bank/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade_subject_id: gradeSubject.id,
            content: form.content,
            exclude_question_id: editingQuestionId
          })
        });
        const data = await res.json();
        if (data.success && data.bank_duplicate?.is_duplicate) {
          setBankDuplicate(data.bank_duplicate);
        } else {
          setBankDuplicate(null);
        }
      } catch (err) {
        console.error('Check duplicate error:', err);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [form.content, gradeSubject?.id, editingQuestionId, mode]);

  // Tải danh sách chủ đề & chi tiết câu hỏi (nếu chỉnh sửa) hoặc nạp dữ liệu từ đề thi
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Tải danh mục chủ đề nếu có thông tin khối môn
        if (gradeSubject?.id) {
          const resTopics = await fetch(`/api/curriculum/topics?grade_subject_id=${gradeSubject.id}`).then(r => r.json());
          if (resTopics.success) {
            setTopics(resTopics.topics || []);
          }
        }

        // 2. Chế độ CHUYÊN SÂU TỪ ĐỀ THI (mode === 'exam_question')
        if (mode === 'exam_question' && initialQuestionData) {
          const q = normalizeQuestion(initialQuestionData);
          const examFormInit = {
            _uid: q._uid,
            id: q.id,
            order_index: q.order_index,
            topic_id: q.topic_id || '',
            lesson_id: q.lesson_id || '',
            level: q.level || 'biet',
            question_type: q.question_type || 'single_choice',
            content: q.content || '',
            options: q.options && q.options.length > 0 ? q.options : (
              q.question_type === 'true_false'
                ? [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }]
                : [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }]
            ),
            correct_answers: q.question_type === 'true_false'
              ? normalizeTrueFalseMap(q.correct_answers, null)
              : (Array.isArray(q.correct_answers) ? q.correct_answers : []),
            short_answer: q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] || '' : ''),
            scoring_config: q.scoring_config || {
              allow_comma_dot_equivalence: true,
              case_sensitive: false,
              trim_whitespace: true,
              numeric_equivalence: false,
              answer_format: 'decimal',
              max_characters: null
            },
            rubric_guide: q.rubric_guide || '',
            default_score: q.default_score !== undefined ? q.default_score : 0.25
          };
          setForm(examFormInit);
          setInitialSnapshot(JSON.stringify({
            content: examFormInit.content,
            question_type: examFormInit.question_type,
            options: examFormInit.options,
            correct_answers: examFormInit.correct_answers,
            short_answer: examFormInit.short_answer,
            scoring_config: examFormInit.scoring_config,
            rubric_guide: examFormInit.rubric_guide,
            default_score: examFormInit.default_score
          }));
          if (examFormInit.rubric_guide) {
            setIsExplanationOpen(true);
          }
          return;
        }

        // 3. Chế độ NGÂN HÀNG CÂU HỎI
        if (editingQuestionId) {
          const resQ = await fetch(`/api/question-bank/${editingQuestionId}`).then(r => r.json());
          if (resQ.success && resQ.question) {
            const q = resQ.question;
            let normalizedCorrect = q.correct_answers;
            if (q.question_type === 'true_false') {
              normalizedCorrect = normalizeTrueFalseMap(q.correct_answers, null);
            } else if (!Array.isArray(normalizedCorrect)) {
              normalizedCorrect = typeof normalizedCorrect === 'string' ? [normalizedCorrect] : ['A'];
            }

            const defaultScoringCfg = {
              allow_comma_dot_equivalence: true,
              case_sensitive: false,
              trim_whitespace: true,
              numeric_equivalence: false,
              answer_format: 'decimal',
              max_characters: null
            };

            const initialShortAnswers = q.question_type === 'short_answer'
              ? (Array.isArray(q.correct_answers) && q.correct_answers.length > 0
                  ? q.correct_answers
                  : (q.short_answer ? [q.short_answer] : []))
              : normalizedCorrect;

            const editFormInit = {
              topic_id: q.topic_id,
              lesson_id: q.lesson_id || '',
              level: q.level || 'biet',
              question_type: q.question_type || 'single_choice',
              content: q.content || '',
              options: q.options && q.options.length > 0 ? q.options : [
                { id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }
              ],
              correct_answers: initialShortAnswers,
              short_answer: q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] || '' : ''),
              scoring_config: q.scoring_config || defaultScoringCfg,
              rubric_guide: q.rubric_guide || '',
              default_score: q.default_score !== undefined ? q.default_score : 0.25
            };
            setForm(editFormInit);
            setInitialSnapshot(JSON.stringify({
              content: editFormInit.content,
              question_type: editFormInit.question_type,
              options: editFormInit.options,
              correct_answers: editFormInit.correct_answers,
              short_answer: editFormInit.short_answer,
              scoring_config: editFormInit.scoring_config,
              rubric_guide: editFormInit.rubric_guide,
              default_score: editFormInit.default_score
            }));

            if (q.rubric_guide) {
              setIsExplanationOpen(true);
            }
          }
        } else {
          // Tạo mới câu hỏi ngân hàng
          const defaultTopic = topics?.[0]?.id || '';
          const newFormInit = {
            topic_id: defaultTopic,
            lesson_id: '',
            level: 'biet',
            question_type: 'single_choice',
            content: '',
            options: [
              { id: 'A', text: '' },
              { id: 'B', text: '' },
              { id: 'C', text: '' },
              { id: 'D', text: '' }
            ],
            correct_answers: ['A'],
            short_answer: '',
            scoring_config: {
              allow_comma_dot_equivalence: true,
              case_sensitive: false,
              trim_whitespace: true,
              numeric_equivalence: false,
              answer_format: 'decimal',
              max_characters: null
            },
            rubric_guide: '',
            default_score: 0.25
          };
          setForm(newFormInit);
          setInitialSnapshot(JSON.stringify({
            content: newFormInit.content,
            question_type: newFormInit.question_type,
            options: newFormInit.options,
            correct_answers: newFormInit.correct_answers,
            short_answer: newFormInit.short_answer,
            scoring_config: newFormInit.scoring_config,
            rubric_guide: newFormInit.rubric_guide,
            default_score: newFormInit.default_score
          }));
          setIsExplanationOpen(false);
        }
      } catch (err) {
        console.error('Fetch editor data error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, gradeSubject?.id, editingQuestionId, mode, initialQuestionData]);

  if (!isOpen) return null;

  const currentTopic = topics.find(t => t.id === form.topic_id);
  const currentLessons = currentTopic?.lessons || [];

  // Đổi dạng câu hỏi theo chuẩn GDPT 2018
  const handleTypeChange = (newType) => {
    let newOptions = form.options;
    let newCorrect = form.correct_answers;
    let newScore = form.default_score;
    let newShort = form.short_answer;

    if (newType === 'true_false') {
      newOptions = [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' }
      ];
      newCorrect = { a: null, b: null, c: null, d: null };
      newScore = 1.0;
    } else if (newType === 'short_answer') {
      newOptions = [];
      newCorrect = [];
      newScore = 0.5;
    } else if (newType === 'essay') {
      newOptions = [];
      newCorrect = [];
      newScore = 1.0;
    } else if (newType === 'single_choice') {
      newOptions = [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ];
      newCorrect = ['A'];
      newScore = 0.25;
    }

    setForm(prev => ({
      ...prev,
      question_type: newType,
      options: newOptions,
      correct_answers: newCorrect,
      short_answer: newShort,
      default_score: newScore
    }));
  };

  const handleUpdateOption = (optId, text) => {
    setForm(prev => ({
      ...prev,
      options: prev.options.map(o => o.id === optId ? { ...o, text } : o)
    }));
  };

  const handleToggleCorrectOption = (optId) => {
    if (form.question_type === 'single_choice') {
      setForm(prev => ({ ...prev, correct_answers: [optId] }));
    }
  };

  const handleSetTrueFalseOption = (optId, val) => {
    setForm(prev => {
      const currentMap = normalizeTrueFalseMap(prev.correct_answers, null);
      currentMap[optId.toLowerCase()] = val;
      return {
        ...prev,
        correct_answers: currentMap
      };
    });
  };

  // Xử lý thêm đáp án tương đương cho Phần III (short_answer)
  const handleAddAnswerTag = () => {
    const val = (newAnswerInput || '').trim();
    if (!val) return;

    const isExamSheet = form.scoring_config?.answer_format === 'exam_sheet';
    if (isExamSheet) {
      if (val.length > 4) {
        alert('⚠️ Đáp án trên phiếu thi THPT chỉ được có tối đa 4 ký tự!');
        return;
      }
      if (!/^[0-9,.\-]+$/.test(val)) {
        alert('⚠️ Phiếu thi THPT chỉ cho phép các ký tự: 0-9, dấu trừ (-), dấu phẩy (,) hoặc dấu chấm (.)!');
        return;
      }
    }

    const currentList = Array.isArray(form.correct_answers) ? form.correct_answers : [];
    if (currentList.includes(val)) {
      setNewAnswerInput('');
      return;
    }

    const updated = [...currentList, val];
    setForm(prev => ({
      ...prev,
      correct_answers: updated,
      short_answer: updated[0] || ''
    }));
    setNewAnswerInput('');
  };

  // Xóa đáp án tương đương
  const handleRemoveAnswerTag = (tagToRemove) => {
    const currentList = Array.isArray(form.correct_answers) ? form.correct_answers : [];
    const updated = currentList.filter(t => t !== tagToRemove);
    setForm(prev => ({
      ...prev,
      correct_answers: updated,
      short_answer: updated[0] || ''
    }));
  };

  // Cập nhật cấu hình scoring_config
  const handleUpdateScoringConfig = (field, value) => {
    setForm(prev => ({
      ...prev,
      scoring_config: {
        ...(prev.scoring_config || {
          allow_comma_dot_equivalence: true,
          case_sensitive: false,
          trim_whitespace: true,
          answer_format: 'decimal',
          max_characters: null
        }),
        [field]: value
      }
    }));
  };

  // Bật/tắt mô phỏng phiếu thi tốt nghiệp THPT 4 ô
  const handleToggleExamSheetSimulation = (enabled) => {
    setForm(prev => {
      const prevConfig = prev.scoring_config || {};
      if (enabled) {
        const invalidAnswers = (prev.correct_answers || []).filter(a => a.length > 4 || !/^[0-9,.\-]+$/.test(a));
        if (invalidAnswers.length > 0) {
          alert(`⚠️ Lưu ý: Một số đáp án hiện tại ("${invalidAnswers.join('", "')}") vượt quá 4 ký tự hoặc chứa ký tự không hợp lệ với phiếu thi THPT. Vui lòng kiểm tra và chỉnh sửa lại.`);
        }
        return {
          ...prev,
          scoring_config: {
            ...prevConfig,
            answer_format: 'exam_sheet',
            max_characters: 4
          }
        };
      } else {
        return {
          ...prev,
          scoring_config: {
            ...prevConfig,
            answer_format: 'decimal',
            max_characters: null
          }
        };
      }
    });
  };

  // Hàm xử lý lưu câu hỏi (có phân biệt Lưu Thường hay Lưu & Tạo Tiếp)
  const handleSaveQuestion = async (shouldCreateNext = false) => {
    // 1. Validate dữ liệu bắt buộc (Chủ đề chỉ bắt buộc đối với Ngân hàng câu hỏi)
    if (mode !== 'exam_question' && !form.topic_id) return alert('Vui lòng chọn chủ đề cho câu hỏi.');
    const rawContent = (form.content || '').replace(/<[^>]+>/g, '').trim();
    if (!rawContent) return alert('Vui lòng nhập nội dung đề bài câu hỏi.');

    if (form.question_type === 'single_choice') {
      const validOptions = form.options.filter(o => o.text && o.text.trim());
      if (validOptions.length < 2) {
        return alert('Vui lòng nhập ít nhất 2 phương án lựa chọn.');
      }
      if (!form.correct_answers || form.correct_answers.length === 0) {
        return alert('Vui lòng chọn 1 phương án làm đáp án đúng.');
      }
    } else if (form.question_type === 'true_false') {
      const filledCount = form.options.filter(o => o.text && o.text.trim()).length;
      if (filledCount < 4) {
        return alert('Dạng câu hỏi Đúng / Sai cần điền đủ nội dung cho cả 4 ý (a, b, c, d).');
      }
      const hasUndetermined = form.options.some(o => getTrueFalseState(form.correct_answers, o.id) === null);
      if (hasUndetermined) {
        return alert('⚠️ Vui lòng chọn xác định rõ Đúng hoặc Sai cho cả 4 ý (a, b, c, d) trước khi lưu!');
      }
    } else if (form.question_type === 'short_answer') {
      const answersList = Array.isArray(form.correct_answers) ? form.correct_answers.filter(Boolean) : [];
      if (answersList.length === 0 && (!form.short_answer || !form.short_answer.trim())) {
        return alert('Vui lòng nhập ít nhất một đáp án chuẩn cho câu trả lời ngắn.');
      }
      if (form.scoring_config?.answer_format === 'exam_sheet') {
        const invalidAnswers = answersList.filter(a => a.length > 4 || !/^[0-9,.\-]+$/.test(a));
        if (invalidAnswers.length > 0) {
          return alert(`⚠️ Các đáp án ("${invalidAnswers.join('", "')}") không hợp lệ với phiếu thi THPT 4 ô. Vui lòng sửa lại trước khi lưu!`);
        }
      }
    }

    if (optionDuplicatePairs && optionDuplicatePairs.length > 0) {
      const dupDetails = optionDuplicatePairs.map(p => `phương án ${p.id1} và ${p.id2}`).join(', ');
      const confirmSave = window.confirm(`⚠️ Cảnh báo: Phát hiện các phương án có nội dung trùng lặp (${dupDetails}).\n\nBạn có chắc chắn vẫn muốn lưu câu hỏi này không?`);
      if (!confirmSave) return;
    }

    // NẾU Ở CHẾ ĐỘ 'exam_question': Cập nhật trực tiếp vào State đề thi trên memory, KHÔNG gọi API ngân hàng
    if (mode === 'exam_question') {
      const answersList = Array.isArray(form.correct_answers) && form.correct_answers.length > 0
        ? form.correct_answers
        : (form.short_answer ? [form.short_answer.trim()] : []);

      const normalized = normalizeQuestion({
        ...(initialQuestionData || {}),
        ...form,
        correct_answers: form.question_type === 'short_answer'
          ? answersList
          : (form.question_type === 'true_false' ? normalizeTrueFalseMap(form.correct_answers, null) : form.correct_answers),
        short_answer: form.question_type === 'short_answer'
          ? (answersList[0] || '')
          : form.short_answer
      });

      if (onApplyToExam) {
        onApplyToExam(normalized);
      }
      onClose();
      return;
    }

    if (bankDuplicate && bankDuplicate.match_type === 'exact') {
      const confirmSave = window.confirm(`⛔ Cảnh báo: Câu hỏi này có nội dung TRÙNG 100% với câu hỏi #${bankDuplicate.matched_question?.id} đã có trong ngân hàng!\n\nBạn có chắc chắn muốn lưu thêm để tạo câu hỏi trùng lặp không?`);
      if (!confirmSave) return;
    }

    try {
      const url = editingQuestionId ? `/api/question-bank/${editingQuestionId}` : '/api/question-bank';
      const method = editingQuestionId ? 'PUT' : 'POST';

      const answersList = Array.isArray(form.correct_answers) && form.correct_answers.length > 0
        ? form.correct_answers
        : (form.short_answer ? [form.short_answer.trim()] : []);

      const payload = {
        grade_subject_id: gradeSubject.id,
        ...form,
        correct_answers: form.question_type === 'short_answer'
          ? answersList
          : (form.question_type === 'true_false' ? normalizeTrueFalseMap(form.correct_answers, null) : form.correct_answers),
        short_answer: form.question_type === 'short_answer'
          ? (answersList[0] || '')
          : form.short_answer
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        return alert(data.message || 'Lỗi khi lưu câu hỏi');
      }

      onSaved();

      if (shouldCreateNext) {
        // GIỮ NGUYÊN: topic_id, lesson_id, level, question_type, default_score, scoring_config
        // RESET: content, options, correct_answers, short_answer, rubric_guide
        const currentType = form.question_type;
        setForm(prev => ({
          ...prev,
          content: '',
          options: currentType === 'true_false' ? [
            { id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }
          ] : [
            { id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }
          ],
          correct_answers: currentType === 'true_false' ? { a: null, b: null, c: null, d: null } : (currentType === 'short_answer' ? [] : ['A']),
          short_answer: '',
          rubric_guide: ''
        }));

        setNewAnswerInput('');
        setActiveTab('edit');
        setBankDuplicate(null);
        setToastMessage('✓ Đã lưu câu hỏi thành công! Thầy/cô có thể tiếp tục soạn câu hỏi tiếp theo.');
        setTimeout(() => setToastMessage(''), 3500);
      } else {
        onClose();
      }
    } catch (err) {
      alert('Lỗi lưu câu hỏi: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
      {/* Box Modal: Viewport 1366x768 chuẩn mực */}
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
        isFullscreen ? '!max-w-none !max-h-none !w-screen !h-screen !rounded-none' : ''
      }`}>
        {/* HEADER */}
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {mode === 'exam_question'
                  ? `Soạn Thảo Chuyên Sâu Câu Hỏi ${initialQuestionData?.order_index ? `#${initialQuestionData.order_index}` : ''}`
                  : (editingQuestionId ? 'Chỉnh Sửa Câu Hỏi Ngân Hàng' : 'Soạn Thảo Câu Hỏi Mới')
                }
                {gradeSubject?.grade_name && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100/80 text-blue-800 border border-blue-200 font-mono font-bold">
                    {gradeSubject.grade_name} - {gradeSubject.subject_name}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                Chuẩn khảo thí Bộ GD&ĐT 2025 / GDPT 2018: Hỗ trợ công thức Toán, bảng biểu, ảnh và barem chi tiết.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
              title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Phóng to toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleRequestClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TOAST THÔNG BÁO KHI LƯU & TẠO TIẾP */}
        {toastMessage && (
          <div className="bg-emerald-500 text-white px-6 py-2 text-xs font-semibold flex items-center justify-between shadow-inner animate-fadeIn">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage('')}
              className="text-emerald-100 hover:text-white cursor-pointer"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* BODY (Cuộn mượt, không tràn viewport) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 bg-white">
          {/* HÀNG 1: CHỦ ĐỀ, BÀI HỌC, MỨC ĐỘ, DẠNG CÂU HỎI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Chủ Đề {mode === 'exam_question' ? '(Không bắt buộc)' : '(*)'}:
              </label>
              <select
                value={form.topic_id}
                onChange={e => setForm({ ...form, topic_id: e.target.value, lesson_id: '' })}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                required={mode !== 'exam_question'}
              >
                <option value="">-- {mode === 'exam_question' ? 'Tùy chọn chủ đề' : 'Chọn chủ đề'} --</option>
                {topics.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Bài Học:
              </label>
              <select
                value={form.lesson_id}
                onChange={e => setForm({ ...form, lesson_id: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                disabled={!form.topic_id || currentLessons.length === 0}
              >
                <option value="">-- Thuộc toàn chủ đề --</option>
                {currentLessons.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Mức Độ Nhận Thức (*):
              </label>
              <select
                value={form.level}
                onChange={e => setForm({ ...form, level: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 font-bold shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                <option value="biet">🟢 Nhận biết (Biết)</option>
                <option value="hieu">🔵 Thông hiểu (Hiểu)</option>
                <option value="van_dung">🟠 Vận dụng (Vận dụng)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Dạng Câu Hỏi GDPT 2018 (*):
              </label>
              <select
                value={form.question_type}
                onChange={e => handleTypeChange(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 font-bold shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                <option value="single_choice">🔹 Trắc nghiệm 4 lựa chọn (Phần I)</option>
                <option value="true_false">⚖️ Đúng / Sai 4 ý (Phần II)</option>
                <option value="short_answer">✏️ Trả lời ngắn (Phần III)</option>
                <option value="essay">✍️ Tự luận chi tiết (Phần IV)</option>
              </select>
            </div>
          </div>

          {/* HÀNG 2: NỘI DUNG ĐỀ BÀI + TAB SWITCH [SOẠN THẢO] / [XEM TRƯỚC] */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                <span>Nội Dung Đề Bài (*):</span>
                <span className="text-[11px] text-slate-400 font-normal lowercase">(soạn thảo trực quan WYSIWYG)</span>
              </label>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'edit'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Soạn Thảo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-white text-blue-700 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem Trước</span>
                </button>
              </div>
            </div>

            {/* TAB SOẠN THẢO VỚI RICHTEXT EDITOR */}
            {activeTab === 'edit' ? (
              <RichQuestionEditor
                content={form.content}
                onChange={val => setForm(prev => ({ ...prev, content: val }))}
                placeholder="Nhập nội dung đề bài câu hỏi... Kéo thả hoặc dán ảnh trực tiếp, nhấn [Toán] để chèn công thức KaTeX."
                compact={false}
              />
            ) : (
              /* TAB XEM TRƯỚC (Renderer bài thi của học sinh: Thấy sao thi vậy) */
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl min-h-[140px] text-slate-900 text-sm leading-relaxed shadow-inner">
                {form.content ? (
                  <MathContent content={form.content} />
                ) : (
                  <span className="text-slate-400 italic text-xs">Chưa có nội dung đề bài để xem trước.</span>
                )}
              </div>
            )}

            {/* TRẠNG THÁI QUÉT TRÙNG LẶP */}
            {checkingDuplicate && (
              <div className="flex items-center gap-2 text-xs text-blue-600 py-1.5 px-3 bg-blue-50 rounded-lg border border-blue-200 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Đang quét kiểm tra trùng lặp trong ngân hàng câu hỏi...</span>
              </div>
            )}

            {/* CẢNH BÁO TRÙNG LẶP NỘI DUNG VỚI NGÂN HÀNG */}
            {bankDuplicate && (
              <div className={`p-3 rounded-xl border text-xs flex items-start gap-3 transition-all ${
                bankDuplicate.match_type === 'exact'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="p-1 rounded-lg bg-white shrink-0 text-base shadow-2xs">
                  {bankDuplicate.match_type === 'exact' ? '⛔' : '⚠️'}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold tracking-wide uppercase">
                      {bankDuplicate.match_type === 'exact' ? 'Phát hiện câu hỏi trùng lặp 100% trong ngân hàng!' : 'Phát hiện câu hỏi tương tự (Trùng khớp mờ)!'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 shrink-0 font-semibold">
                      Độ tương đồng: {Math.round((bankDuplicate.similarity || 1) * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 line-clamp-2 italic">
                    "{(bankDuplicate.matched_question?.content || '').replace(/<[^>]+>/g, '').slice(0, 150)}..."
                  </p>
                  <div className="text-[10px] opacity-75">
                    Mã câu trong kho: <span className="font-mono font-bold">#{bankDuplicate.matched_question?.id}</span> • Chủ đề: {bankDuplicate.matched_question?.topic_name || 'Chung'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* HÀNG 3: DYNAMIC UI THEO DẠNG CÂU HỎI */}

          {/* DẠNG 1: TRẮC NGHIỆM 4 LỰA CHỌN (PHẦN I) */}
          {form.question_type === 'single_choice' && (
            <div className="space-y-3 bg-slate-50/90 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase">
                  Bốn Phương Án Lựa Chọn (Click chữ cái A, B, C, D để chọn đáp án đúng):
                </span>
                <div className="flex items-center gap-3">
                  {optionDuplicatePairs.length > 0 && (
                    <span className="text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Có {optionDuplicatePairs.length} cặp phương án trùng nhau!
                    </span>
                  )}
                  <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ✓ Đáp án đúng: {form.correct_answers[0] || 'A'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {form.options.map(opt => {
                  const isCorrect = Array.isArray(form.correct_answers) && form.correct_answers.includes(opt.id);
                  const duplicateWith = optionDuplicatePairs.find(p => p.id1 === opt.id || p.id2 === opt.id);
                  const dupPartner = duplicateWith ? (duplicateWith.id1 === opt.id ? duplicateWith.id2 : duplicateWith.id1) : null;

                  return (
                    <div
                      key={opt.id}
                      className={`p-3 rounded-xl border transition space-y-2 shadow-2xs ${
                        dupPartner
                          ? 'bg-rose-50/70 border-rose-400 ring-1 ring-rose-300'
                          : isCorrect
                            ? 'bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-300'
                            : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleCorrectOption(opt.id)}
                          className={`px-3 py-1 rounded-lg flex items-center gap-1.5 font-bold text-xs transition shrink-0 cursor-pointer ${
                            isCorrect
                              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          <span className="font-mono text-sm">{opt.id}</span>
                          {isCorrect ? (
                            <span className="text-[10px] tracking-wide uppercase font-bold">✓ ĐÁP ÁN ĐÚNG</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-normal">Click chọn đúng</span>
                          )}
                        </button>

                        {dupPartner && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Trùng với {dupPartner}
                          </span>
                        )}
                      </div>

                      {/* COMPACT RICH EDITOR CHO PHƯƠNG ÁN */}
                      <RichQuestionEditor
                        compact={true}
                        content={opt.text}
                        onChange={val => handleUpdateOption(opt.id, val)}
                        placeholder={`Nội dung phương án ${opt.id}...`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DẠNG 2: ĐÚNG / SAI 4 Ý (PHẦN II) */}
          {form.question_type === 'true_false' && (
            <div className="space-y-3 bg-slate-50/90 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase block">
                  Bốn Mệnh Đề Đúng / Sai (Mỗi ý chọn Đúng hoặc Sai):
                </span>
                {optionDuplicatePairs.length > 0 && (
                  <span className="text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Có {optionDuplicatePairs.length} cặp ý trùng nhau!
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {form.options.map(opt => {
                  const state = getTrueFalseState(form.correct_answers, opt.id);
                  const isDung = state === 'T';
                  const isSai = state === 'F';
                  const duplicateWith = optionDuplicatePairs.find(p => p.id1 === opt.id || p.id2 === opt.id);
                  const dupPartner = duplicateWith ? (duplicateWith.id1 === opt.id ? duplicateWith.id2 : duplicateWith.id1) : null;

                  return (
                    <div
                      key={opt.id}
                      className={`p-3 rounded-xl border transition space-y-2 shadow-2xs ${
                        dupPartner
                          ? 'bg-rose-50/70 border-rose-400 ring-1 ring-rose-300'
                          : isDung
                            ? 'bg-teal-50/70 border-teal-400 ring-1 ring-teal-300'
                            : isSai
                              ? 'bg-white border-slate-200'
                              : 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm font-mono text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                          Ý {opt.id})
                        </span>

                        {/* TOGGLE 2 NÚT [ĐÚNG] VÀ [SAI] VỚI TRẠNG THÁI TRUNG TÍNH */}
                        <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => handleSetTrueFalseOption(opt.id, 'T')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                              isDung
                                ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-400'
                                : 'text-slate-600 hover:bg-slate-200/80'
                            }`}
                          >
                            ✓ ĐÚNG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetTrueFalseOption(opt.id, 'F')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                              isSai
                                ? 'bg-rose-600 text-white shadow-2xs ring-1 ring-rose-400'
                                : 'text-slate-600 hover:bg-slate-200/80'
                            }`}
                          >
                            ✕ SAI
                          </button>
                        </div>
                      </div>

                      {/* COMPACT RICH EDITOR CHO MỆNH ĐỀ */}
                      <RichQuestionEditor
                        compact={true}
                        content={opt.text}
                        onChange={val => handleUpdateOption(opt.id, val)}
                        placeholder={`Nội dung ý ${opt.id}...`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DẠNG 3: TRẢ LỜI NGẮN (PHẦN III) */}
          {form.question_type === 'short_answer' && (
            <div className="space-y-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 uppercase flex items-center gap-1.5">
                  <span>✏️ Đáp Án Chuẩn Xác Của Câu Hỏi:</span>
                  <span className="text-[11px] font-normal normal-case text-emerald-700">
                    (Hỗ trợ nhiều đáp án tương đương như số thập phân, phân số hoặc kết quả code)
                  </span>
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {(form.correct_answers || []).length} đáp án chấp nhận
                </span>
              </div>

              {/* Multi-Input / Tag Input */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newAnswerInput}
                      onChange={e => setNewAnswerInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAnswerTag();
                        }
                      }}
                      placeholder={
                        form.scoring_config?.answer_format === 'exam_sheet'
                          ? "Nhập đáp án chuẩn theo phiếu thi THPT (tối đa 4 ký tự, vd: 2.5, -3, 12)..."
                          : "Nhập đáp án (ví dụ: 2.5) rồi bấm Enter hoặc [Thêm đáp án]..."
                      }
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono font-bold focus:border-emerald-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAnswerTag}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Đáp Án</span>
                  </button>
                </div>

                {/* Danh sách thẻ Tags đáp án */}
                <div className="flex flex-wrap items-center gap-2 min-h-[36px] p-2 bg-white rounded-xl border border-emerald-200">
                  {(!form.correct_answers || form.correct_answers.length === 0) ? (
                    <span className="text-xs text-slate-400 italic px-1">
                      Chưa có đáp án nào. Vui lòng nhập ít nhất 1 đáp án chuẩn bên trên.
                    </span>
                  ) : (
                    form.correct_answers.map((ans, idx) => {
                      const isExamSheet = form.scoring_config?.answer_format === 'exam_sheet';
                      const isInvalidSheet = isExamSheet && (ans.length > 4 || !/^[0-9,.\-]+$/.test(ans));
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold shadow-2xs transition ${
                            isInvalidSheet
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 ring-1 ring-rose-400'
                              : idx === 0
                              ? 'bg-emerald-600 text-white border border-emerald-700'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                          title={idx === 0 ? 'Đáp án chính mặc định' : 'Đáp án tương đương'}
                        >
                          {idx === 0 && <span className="text-[10px] font-sans font-normal opacity-80">(Chính)</span>}
                          <span>{ans}</span>
                          {isInvalidSheet && (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" title="Không hợp lệ với phiếu thi THPT 4 ô!" />
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAnswerTag(ans)}
                            className="hover:bg-black/10 rounded-full p-0.5 transition cursor-pointer"
                            title="Xóa đáp án này"
                          >
                            <CloseIcon className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Cảnh báo phiếu thi nếu có đáp án không hợp lệ */}
                {form.scoring_config?.answer_format === 'exam_sheet' && (form.correct_answers || []).some(a => a.length > 4 || !/^[0-9,.\-]+$/.test(a)) && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      <strong>Cảnh báo:</strong> Phiếu thi tốt nghiệp THPT chỉ gồm tối đa 4 ô vuông và chỉ nhận các ký tự số, dấu trừ (-), dấu phẩy (,) hoặc dấu chấm (.). Các đáp án màu đỏ đang vi phạm điều kiện này!
                    </span>
                  </div>
                )}
              </div>

              {/* KHỐI TÙY CHỌN CHẤM ĐIỂM (Scoring Settings) */}
              <div className="bg-white rounded-xl border border-emerald-200 p-3.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cấu Hình Chấm Điểm Tự Động:</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Chuẩn khảo thí Bộ GD&ĐT</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-slate-700">
                  {/* Checkbox 1: Tương đương dấu phẩy và dấu chấm */}
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                    <input
                      type="checkbox"
                      checked={form.scoring_config?.allow_comma_dot_equivalence !== false}
                      onChange={e => handleUpdateScoringConfig('allow_comma_dot_equivalence', e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold block text-slate-800">
                        Cho phép tương đương dấu phẩy (,) và dấu chấm (.)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Ví dụ học sinh điền <code className="font-mono bg-slate-100 px-1 rounded">2,5</code> hoặc <code className="font-mono bg-slate-100 px-1 rounded">2.5</code> đều được tính điểm tối đa.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox 2: Phân biệt hoa thường */}
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                    <input
                      type="checkbox"
                      checked={!!form.scoring_config?.case_sensitive}
                      onChange={e => handleUpdateScoringConfig('case_sensitive', e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold block text-slate-800">
                        Phân biệt chữ hoa / chữ thường (Case-sensitive)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Khuyến nghị bật cho môn Tin học khi học sinh cần điền tên biến, từ khóa hoặc cú pháp lệnh.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox 3: Tự động xóa khoảng trắng */}
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                    <input
                      type="checkbox"
                      checked={form.scoring_config?.trim_whitespace !== false}
                      onChange={e => handleUpdateScoringConfig('trim_whitespace', e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-semibold block text-slate-800">
                        Tự động loại bỏ khoảng trắng thừa (Trim Whitespace)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Tự động xóa khoảng trắng trước/sau và khoảng trắng vô tình xen giữa các chữ số.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox 4: Mô phỏng phiếu thi THPT 4 ô */}
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg bg-emerald-50/70 hover:bg-emerald-100/60 border border-emerald-200 transition">
                    <input
                      type="checkbox"
                      checked={form.scoring_config?.answer_format === 'exam_sheet'}
                      onChange={e => handleToggleExamSheetSimulation(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 border-emerald-400 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold block text-emerald-900">
                        Mô phỏng phiếu thi tốt nghiệp THPT (Tối đa 4 ký tự)
                      </span>
                      <span className="text-[11px] text-emerald-700 block">
                        Giới hạn 4 ô nhập, chỉ cho phép số, dấu âm (-), dấu phẩy (,) hoặc chấm (.).
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Xem trước hiển thị đáp án bằng KaTeX */}
              {form.correct_answers && form.correct_answers.length > 0 && (
                <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs text-emerald-800 shadow-2xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                    👁️ Xem trước hiển thị công thức đáp án:
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    {form.correct_answers.map((ans, idx) => (
                      <div key={idx} className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 font-mono">
                        <MathContent content={ans} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DẠNG 4: TỰ LUẬN CHI TIẾT (PHẦN IV - RUBRIC) */}
          {form.question_type === 'essay' && (
            <div className="space-y-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 uppercase">
                  ✍️ Hướng Dẫn Chấm & Biểu Điểm (Rubric):
                </span>
                <span className="text-[11px] text-indigo-600">
                  Dành cho giáo viên khi chấm bài tự luận
                </span>
              </div>
              <RichQuestionEditor
                content={form.rubric_guide}
                onChange={val => setForm(prev => ({ ...prev, rubric_guide: val }))}
                placeholder="Nhập barem chấm điểm, các bước cho điểm hoặc đáp án tự luận chi tiết..."
                compact={false}
              />
            </div>
          )}

          {/* HÀNG 4: ACCORDION LỜI GIẢI CHI TIẾT / HƯỚNG DẪN GIẢI (TÙY CHỌN) */}
          {form.question_type !== 'essay' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/60">
              <button
                type="button"
                onClick={() => setIsExplanationOpen(!isExplanationOpen)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-100 transition cursor-pointer"
              >
                <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Lời Giải Chi Tiết / Hướng Dẫn Giải (Tùy chọn)
                  {form.rubric_guide && (
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Đã có nội dung
                    </span>
                  )}
                </span>
                {isExplanationOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {isExplanationOpen && (
                <div className="p-4 pt-1 bg-white border-t border-slate-200 space-y-2">
                  <p className="text-[11px] text-slate-500">
                    Phần lời giải chi tiết sẽ hiển thị khi học sinh xem lại bài làm sau khi thi xong (nếu giáo viên cho phép xem đáp án & lời giải).
                  </p>
                  <RichQuestionEditor
                    content={form.rubric_guide}
                    onChange={val => setForm(prev => ({ ...prev, rubric_guide: val }))}
                    placeholder="Nhập lời giải thích chi tiết, cách tính toán hoặc giải thích vì sao chọn đáp án này..."
                    compact={false}
                  />
                </div>
              )}
            </div>
          )}

          {/* HÀNG 5: ĐIỂM SỐ MẶC ĐỊNH */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <label className="text-xs text-slate-700 flex items-center gap-2">
              <span className="font-bold">Điểm số mặc định:</span>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="10.0"
                value={form.default_score}
                onChange={e => setForm({ ...form, default_score: parseFloat(e.target.value) || 0.25 })}
                className="w-20 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 font-bold text-xs text-center shadow-2xs focus:border-blue-500 focus:outline-none"
              />
              <span className="text-slate-600 font-semibold">điểm</span>
            </label>
            <span className="text-[11px] text-slate-400 italic">
              * Điểm số có thể tùy chỉnh lại khi gán vào từng đề thi cụ thể.
            </span>
          </div>
        </div>

        {/* FOOTER: NÚT [HỦY BỎ], [LƯU & TẠO TIẾP], [LƯU VÀO NGÂN HÀNG / LƯU VÀO ĐỀ THI] */}
        <div className="flex-shrink-0 border-t border-slate-200 px-6 py-3.5 bg-white flex items-center justify-between z-10">
          <button
            type="button"
            onClick={handleRequestClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Hủy Bỏ
          </button>

          <div className="flex items-center gap-2.5">
            {!editingQuestionId && mode !== 'exam_question' && (
              <button
                type="button"
                onClick={() => handleSaveQuestion(true)}
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Lưu câu hỏi hiện tại và giữ nguyên phân loại để tiếp tục soạn câu mới"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Lưu & Tạo Tiếp</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveQuestion(false)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              {mode === 'exam_question' ? <Sparkles className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>
                {mode === 'exam_question'
                  ? 'Lưu & Cập Nhật Vào Đề Thi'
                  : (editingQuestionId ? 'Cập Nhật Câu Hỏi' : 'Lưu Vào Ngân Hàng')
                }
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

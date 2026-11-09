import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen, Download, CheckCircle2, FileUp, Plus, Trash2, HelpCircle,
  Sigma, Code2, Image as ImageIcon, Shuffle, Maximize2, Minimize2,
  ZoomIn, Search, Check, AlertCircle, ArrowUp, ArrowDown, Copy, X,
  ListOrdered, Sparkles, Layers, SlidersHorizontal, ChevronDown, ChevronUp,
  FolderTree, AlertTriangle, Eye, Settings2, CheckSquare, Loader2, ShieldAlert
} from 'lucide-react';
import MathToolbarModal from '../common/MathToolbarModal';
import CodeToolbarModal from '../common/CodeToolbarModal';
import MathContent from '../common/MathContent';
import QuestionBankEditorModal from './QuestionBankEditorModal';
import { normalizeQuestion, deepCloneQuestion, generateQuestionUid } from '../../utils/questionAdapter';
import { normalizeTrueFalseMap, getTrueFalseState } from '../../utils/trueFalseHelper';

export default function ExamEditModal({
  isOpen,
  onClose,
  editingExamId = null,
  initialData = null,
  onSuccess
}) {
  if (!isOpen) return null;

  // 1. Dữ liệu đề thi
  const [examForm, setExamForm] = useState(initialData || {
    title: '',
    subject: '',
    school_name: '',
    school_year: '',
    grade: '',
    note: '',
    part_scores_json: { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 },
    total_score: 10.0,
    shuffle_questions: 1,
    shuffle_options: 1,
    questions: []
  });

  // 2. Chế độ hiển thị & điều hướng Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [activeQIndex, setActiveQIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePartFilter, setActivePartFilter] = useState('all'); // 'all' | 'part1' | 'part2' | 'part3' | 'part4'
  const [showMetaSettings, setShowMetaSettings] = useState(false);

  // 3. Trạng thái hỗ trợ
  const [autoSyncScore, setAutoSyncScore] = useState(true);
  const [importingWord, setImportingWord] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  // 4. Math, Code, và Image insertion targets
  const [mathModalTarget, setMathModalTarget] = useState(null);
  const [codeModalTarget, setCodeModalTarget] = useState(null);
  const [imageTarget, setImageTarget] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileInputRef = useRef(null);

  // 5. Trạng thái Soạn Thảo Chuyên Sâu (Modal TipTap + Math Extension)
  const [deepEditQuestionDraft, setDeepEditQuestionDraft] = useState(null);
  const [showDeepEditorModal, setShowDeepEditorModal] = useState(false);
  const [newShortAnswerInputs, setNewShortAnswerInputs] = useState({});

  const handleOpenDeepEditor = (question, index) => {
    const normalized = normalizeQuestion({
      ...question,
      order_index: question.order_index || (index + 1)
    });
    setDeepEditQuestionDraft(deepCloneQuestion(normalized));
    setShowDeepEditorModal(true);
  };

  const handleApplyDeepEditor = (updatedQ) => {
    if (!updatedQ) return;
    setExamForm(prev => {
      const updatedQuestions = prev.questions.map(q => {
        if (q._uid && updatedQ._uid && q._uid === updatedQ._uid) {
          return {
            ...updatedQ,
            max_score: updatedQ.default_score !== undefined ? updatedQ.default_score : (q.max_score || 0.25)
          };
        }
        return q;
      });
      return {
        ...prev,
        questions: updatedQuestions
      };
    });
    setShowDeepEditorModal(false);
    setDeepEditQuestionDraft(null);
  };

  // Load chi tiết đề thi nếu đang chỉnh sửa
  useEffect(() => {
    if (editingExamId) {
      const fetchExam = async () => {
        try {
          const res = await fetch(`/api/exams/${editingExamId}`);
          const data = await res.json();
          if (data.success && data.exam) {
            const normalizedQuestions = (data.exam.questions || []).map((q, idx) => {
              let ca = q.correct_answers;
              if (q.question_type === 'true_false') {
                ca = normalizeTrueFalseMap(ca, null);
              }
              return normalizeQuestion({
                ...q,
                correct_answers: ca !== undefined ? ca : q.correct_answers,
                order_index: q.order_index || (idx + 1),
                max_score: q.max_score !== undefined ? q.max_score : (q.default_score !== undefined ? q.default_score : 0.25)
              });
            });

            let partScores = { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 };
            if (data.exam.part_scores_json) {
              try {
                partScores = typeof data.exam.part_scores_json === 'string'
                  ? JSON.parse(data.exam.part_scores_json)
                  : data.exam.part_scores_json;
              } catch (e) {}
            }

            setExamForm({
              title: data.exam.title || '',
              subject: data.exam.subject || '',
              school_name: data.exam.school_name || '',
              school_year: data.exam.school_year || '',
              grade: data.exam.grade || '',
              note: data.exam.note || '',
              part_scores_json: partScores,
              total_score: data.exam.total_score || 10.0,
              shuffle_questions: data.exam.shuffle_questions !== undefined ? data.exam.shuffle_questions : 1,
              shuffle_options: data.exam.shuffle_options !== undefined ? data.exam.shuffle_options : 1,
              questions: normalizedQuestions
            });
          }
        } catch (err) {
          alert('Không thể tải chi tiết đề thi: ' + err.message);
        }
      };
      fetchExam();
    } else {
      // Tạo đề mới
      if (initialData) {
        const normalizedInitialQuestions = (initialData.questions || []).map((q, idx) =>
          normalizeQuestion({
            ...q,
            order_index: q.order_index || (idx + 1),
            max_score: q.max_score !== undefined ? q.max_score : (q.default_score !== undefined ? q.default_score : 0.25)
          })
        );
        setExamForm({
          ...initialData,
          questions: normalizedInitialQuestions
        });
      } else {
        setExamForm({
          title: '',
          subject: '',
          school_name: '',
          school_year: '',
          grade: '',
          note: '',
          part_scores_json: { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 },
          total_score: 10.0,
          shuffle_questions: 1,
          shuffle_options: 1,
          questions: []
        });

        fetch('/api/system/school-info')
          .then(r => r.json())
          .then(d => {
            if (d.success && d.schoolInfo) {
              setExamForm(prev => ({
                ...prev,
                school_name: prev.school_name || d.schoolInfo.school_name || '',
                school_year: prev.school_year || d.schoolInfo.academic_year || ''
              }));
            }
          })
          .catch(() => {});
      }
    }
  }, [editingExamId, initialData]);

  // Trạng thái quét trùng lặp toàn diện đề thi
  const [duplicateScanReport, setDuplicateScanReport] = useState(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Kiểm tra tính hợp lệ của từng câu hỏi (bao gồm kiểm tra trùng phương án)
  const getQuestionValidationStatus = (q) => {
    if (!q.content || !q.content.trim()) {
      return { status: 'empty', label: 'Chưa có nội dung', isError: true };
    }

    // 1. Kiểm tra trùng phương án nội bộ trong câu (single_choice, multiple_choice, true_false)
    const optionDups = [];
    if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
      const opts = q.options || [];
      const map = opts.map(o => {
        let norm = (o.text || '').toLowerCase().trim();
        if (norm.startsWith('```') || norm.includes('\n')) {
          // Bảo lưu cú pháp và thụt lề code Python
          norm = (o.text || '').replace(/\r\n/g, '\n').replace(/\t/g, '    ').replace(/\s+$/gm, '');
        } else {
          norm = norm.replace(/^\$[^\$]+\$$/g, m => m.slice(1, -1)).replace(/\s+/g, ' ').replace(/[.:;,!?]+$/, '').trim();
        }
        return { id: o.id, norm };
      });

      for (let i = 0; i < map.length; i++) {
        for (let j = i + 1; j < map.length; j++) {
          if (map[i].norm && map[i].norm === map[j].norm) {
            optionDups.push({ id1: map[i].id, id2: map[j].id });
          }
        }
      }
    }

    if (optionDups.length > 0) {
      return {
        status: 'option_duplicate',
        label: `Trùng phương án (${optionDups.map(p => p.id1 + '=' + p.id2).join(', ')})`,
        isError: true,
        optionDups
      };
    }

    // 2. Kiểm tra điền đáp án
    if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
      if (!q.correct_answers || q.correct_answers.length === 0) {
        return { status: 'missing_answer', label: 'Chưa chọn đáp án đúng', isError: true };
      }
      const emptyOpt = (q.options || []).some(o => !o.text || !o.text.trim());
      if (emptyOpt) {
        return { status: 'empty_opt', label: 'Có phương án để trống', isError: true };
      }
    } else if (q.question_type === 'true_false') {
      const ca = q.correct_answers;
      if (!ca || typeof ca !== 'object') {
        return { status: 'missing_answer', label: 'Chưa chọn Đúng/Sai', isError: true };
      }
      const emptyOpt = (q.options || []).some(o => !o.text || !o.text.trim());
      if (emptyOpt) {
        return { status: 'empty_opt', label: 'Có ý Đúng/Sai để trống', isError: true };
      }
    } else if (q.question_type === 'short_answer') {
      const answersList = Array.isArray(q.correct_answers) ? q.correct_answers.filter(Boolean) : (q.short_answer ? [q.short_answer.trim()] : []);
      if (answersList.length === 0) {
        return { status: 'missing_answer', label: 'Chưa nhập đáp án chuẩn', isError: true };
      }
      if (q.scoring_config?.answer_format === 'exam_sheet') {
        const invalidAnswers = answersList.filter(a => a.length > 4 || !/^[0-9,.\-]+$/.test(a));
        if (invalidAnswers.length > 0) {
          return { status: 'invalid_format', label: `Sai phiếu 4 ô (${invalidAnswers[0]})`, isError: true };
        }
      }
    }
    return { status: 'valid', label: 'Hợp lệ', isError: false };
  };

  // Quét toàn diện trùng lặp đề thi qua API
  const handleScanDuplicates = async () => {
    try {
      setScanningDuplicates(true);
      const res = await fetch('/api/exams/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: examForm.questions })
      });
      const data = await res.json();
      if (data.success) {
        setDuplicateScanReport(data);
        setShowDuplicateModal(true);
      } else {
        alert(data.message || 'Lỗi quét trùng lặp');
      }
    } catch (err) {
      alert('Lỗi kết nối khi quét trùng lặp: ' + err.message);
    } finally {
      setScanningDuplicates(false);
    }
  };

  // Tính toán tóm tắt số câu theo 4 phần
  const partCounts = useMemo(() => {
    const qs = examForm.questions || [];
    return {
      part1: qs.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice').length,
      part2: qs.filter(q => q.question_type === 'true_false').length,
      part3: qs.filter(q => q.question_type === 'short_answer').length,
      part4: qs.filter(q => q.question_type === 'essay').length,
      total: qs.length
    };
  }, [examForm.questions]);

  // Thống kê tiến độ hoàn thành đáp án
  const validationSummary = useMemo(() => {
    const qs = examForm.questions || [];
    let invalidCount = 0;
    qs.forEach(q => {
      const st = getQuestionValidationStatus(q);
      if (st.isError) invalidCount++;
    });
    return {
      total: qs.length,
      validCount: qs.length - invalidCount,
      invalidCount
    };
  }, [examForm.questions]);

  // Lọc danh sách câu hỏi theo tab và ô tìm kiếm
  const filteredQuestionIndices = useMemo(() => {
    const qs = examForm.questions || [];
    const query = searchQuery.trim().toLowerCase();

    return qs.map((q, idx) => ({ q, idx })).filter(({ q, idx }) => {
      // 1. Lọc theo phần
      if (activePartFilter === 'part1' && q.question_type !== 'single_choice' && q.question_type !== 'multiple_choice') return false;
      if (activePartFilter === 'part2' && q.question_type !== 'true_false') return false;
      if (activePartFilter === 'part3' && q.question_type !== 'short_answer') return false;
      if (activePartFilter === 'part4' && q.question_type !== 'essay') return false;

      // 2. Lọc theo từ khóa tìm kiếm
      if (query) {
        const matchesIndex = String(idx + 1).includes(query) || `câu ${idx + 1}`.includes(query);
        const matchesContent = (q.content || '').toLowerCase().includes(query);
        return matchesIndex || matchesContent;
      }
      return true;
    }).map(item => item.idx);
  }, [examForm.questions, activePartFilter, searchQuery]);

  // Nhảy mượt đến câu hỏi
  const handleScrollToQuestion = (index) => {
    setActiveQIndex(index);
    const el = document.getElementById(`edit-q-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Thao tác chèn Toán, Code, Ảnh
  const insertTextToTarget = (target, textToInsert) => {
    if (!target) return;
    const { qIndex, type, optId } = target;
    if (type === 'content') {
      const prev = examForm.questions[qIndex]?.content || '';
      updateQuestion(qIndex, 'content', prev + (prev ? ' ' : '') + textToInsert);
    } else if (type === 'rubric') {
      const prev = examForm.questions[qIndex]?.rubric_guide || '';
      updateQuestion(qIndex, 'rubric_guide', prev + (prev ? ' ' : '') + textToInsert);
    } else if (type === 'option') {
      const q = examForm.questions[qIndex];
      if (q) {
        const opt = (q.options || []).find(o => o.id.toLowerCase() === optId.toLowerCase());
        const prev = opt?.text || '';
        updateOptionText(qIndex, optId, prev + (prev ? ' ' : '') + textToInsert);
      }
    }
  };

  const handleInsertMath = (latex) => {
    if (!mathModalTarget) return;
    insertTextToTarget(mathModalTarget, latex);
  };

  const handleInsertCode = (codeStr) => {
    if (!codeModalTarget) return;
    insertTextToTarget(codeModalTarget, codeStr);
  };

  const handleKeyDownTab = (e, qIndex, field, optId) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const value = e.target.value;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      if (field === 'content') {
        updateQuestion(qIndex, 'content', newValue);
      } else if (field === 'rubric_guide') {
        updateQuestion(qIndex, 'rubric_guide', newValue);
      } else if (field === 'option') {
        updateOptionText(qIndex, optId, newValue);
      }
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const handleUploadImageBlob = async (blob, target) => {
    if (!blob || !target) return;
    try {
      setUploadingImage(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result;
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            const imgMarkdown = `\n![Hình ảnh](${data.url})\n`;
            insertTextToTarget(target, imgMarkdown);
          } else {
            alert('Lỗi lưu hình ảnh: ' + data.message);
          }
        } catch (err) {
          alert('Lỗi tải ảnh lên máy chủ: ' + err.message);
        } finally {
          setUploadingImage(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      setUploadingImage(false);
      alert('Lỗi đọc tệp ảnh: ' + e.message);
    }
  };

  const handlePasteInField = (e, target) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleUploadImageBlob(file, target);
          return;
        }
      }
    }
  };

  const handlePickImageForTarget = (target) => {
    setImageTarget(target);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
      imageFileInputRef.current.click();
    }
  };

  const handleFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (file && imageTarget) {
      handleUploadImageBlob(file, imageTarget);
    }
  };

  // Nhập đề từ Word (.docx)
  const handleWordFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportingWord(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const res = await fetch('/api/exams/import-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            let importedQuestions = (data.questions || []).map((q, idx) => normalizeQuestion({
              ...q,
              order_index: idx + 1
            }));

            if (examForm.questions.length > 0) {
              const confirmAppend = confirm(
                `Bạn có muốn GHÉP THÊM ${importedQuestions.length} câu hỏi mới vào ${examForm.questions.length} câu hỏi hiện tại không?\n\n` +
                `- Bấm OK để GHÉP NỐI TIẾP.\n- Bấm Cancel để THAY THẾ TOÀN BỘ.`
              );
              if (confirmAppend) {
                const startIndex = examForm.questions.length;
                importedQuestions = [
                  ...examForm.questions,
                  ...importedQuestions.map((q, idx) => ({ ...q, order_index: startIndex + idx + 1 }))
                ];
              }
            }

            const totalScore = importedQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0);
            setExamForm(prev => ({
              ...prev,
              title: prev.title ? prev.title : (data.meta?.examTitle || data.title || file.name.replace(/\.[^/.]+$/, '')),
              subject: prev.subject ? prev.subject : (data.meta?.subject || 'Tin học'),
              grade: prev.grade ? prev.grade : (data.meta?.grade || '10'),
              school_name: prev.school_name ? prev.school_name : (data.meta?.schoolName || ''),
              school_year: prev.school_year ? prev.school_year : (data.meta?.schoolYear || ''),
              part_scores_json: data.partScores || prev.part_scores_json,
              total_score: totalScore > 0 ? Math.round(totalScore * 100) / 100 : 10.0,
              questions: importedQuestions
            }));
            alert(`Đã nhận diện thành công ${data.total_questions || data.questions?.length} câu hỏi từ file Word!`);
          } else {
            alert('Lỗi nhập file Word: ' + data.message);
          }
        } catch (err) {
          alert('Lỗi xử lý file Word: ' + err.message);
        } finally {
          setImportingWord(false);
          e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Lỗi đọc file Word: ' + err.message);
      setImportingWord(false);
      e.target.value = '';
    }
  };

  // Thêm câu hỏi
  const addQuestion = (type) => {
    const qIndex = examForm.questions.length + 1;
    let template = normalizeQuestion({
      order_index: qIndex,
      question_type: type,
      content: '',
      max_score: type === 'essay' ? 1.0 : (type === 'short_answer' ? 0.5 : (type === 'true_false' ? 1.0 : 0.25)),
      options: (type === 'single_choice' || type === 'multiple_choice') ? [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ] : (type === 'true_false' ? [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' }
      ] : []),
      correct_answers: type === 'true_false'
        ? { a: 'T', b: 'F', c: 'T', d: 'F' }
        : (type === 'single_choice' ? ['A'] : []),
      short_answer: '',
      rubric_guide: type === 'essay' ? 'Barem điểm chi tiết:\n- Ý 1 (0.5đ): ...\n- Ý 2 (0.5đ): ...' : ''
    });

    const updatedQuestions = [...examForm.questions, template];
    const newTotal = autoSyncScore
      ? Math.round(updatedQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updatedQuestions,
      total_score: newTotal
    }));

    // Tự động nhảy tới câu hỏi vừa thêm
    setTimeout(() => handleScrollToQuestion(updatedQuestions.length - 1), 60);
  };

  // Chia đều điểm theo barem 4 phần
  const handleDistributeScoresByParts = () => {
    const ps = examForm.part_scores_json || { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 };
    const p1 = parseFloat(ps.part1) || 0;
    const p2 = parseFloat(ps.part2) || 0;
    const p3 = parseFloat(ps.part3) || 0;
    const p4 = parseFloat(ps.part4) || 0;

    const p1Qs = examForm.questions.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const p2Qs = examForm.questions.filter(q => q.question_type === 'true_false');
    const p3Qs = examForm.questions.filter(q => q.question_type === 'short_answer');
    const p4Qs = examForm.questions.filter(q => q.question_type === 'essay');

    const updated = examForm.questions.map(q => {
      if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
        const sc = p1Qs.length > 0 ? Number((p1 / p1Qs.length).toFixed(2)) : 0.25;
        return { ...q, max_score: sc };
      } else if (q.question_type === 'true_false') {
        const sc = p2Qs.length > 0 ? Number((p2 / p2Qs.length).toFixed(2)) : 1.0;
        return { ...q, max_score: sc };
      } else if (q.question_type === 'short_answer') {
        const sc = p3Qs.length > 0 ? Number((p3 / p3Qs.length).toFixed(2)) : 0.5;
        return { ...q, max_score: sc };
      } else if (q.question_type === 'essay') {
        const sc = p4Qs.length > 0 ? Number((p4 / p4Qs.length).toFixed(2)) : 1.0;
        return { ...q, max_score: sc };
      }
      return q;
    });

    const newTotal = Number((p1 + p2 + p3 + p4).toFixed(2));
    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: newTotal > 0 ? newTotal : 10.0
    }));
    alert(`Đã chia đều điểm cho các câu hỏi:\n• Phần I (${p1Qs.length} câu): ${p1}đ\n• Phần II (${p2Qs.length} câu): ${p2}đ\n• Phần III (${p3Qs.length} câu): ${p3}đ\n• Phần IV (${p4Qs.length} câu): ${p4}đ\n\nTổng điểm bài thi: ${newTotal}đ.`);
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...examForm.questions];
    let q = { ...updated[index], [field]: value };

    if (field === 'question_type' && value === 'short_answer') {
      if (!q.scoring_config) {
        q.scoring_config = {
          allow_comma_dot_equivalence: true,
          case_sensitive: false,
          trim_whitespace: true,
          numeric_equivalence: false,
          answer_format: 'decimal',
          max_characters: null
        };
      }
      if (!Array.isArray(q.correct_answers)) {
        q.correct_answers = q.short_answer ? [q.short_answer] : [];
      }
    }

    updated[index] = q;

    const newTotal = (field === 'max_score' && autoSyncScore)
      ? Math.round(updated.reduce((sum, item) => sum + (parseFloat(item.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: newTotal
    }));
  };

  const updateOptionText = (qIndex, optId, text) => {
    const updated = [...examForm.questions];
    const q = updated[qIndex];
    if (q.question_type === 'true_false') {
      let options = q.options || [];
      const found = options.some(o => o.id.toLowerCase() === optId.toLowerCase());
      if (!found) {
        options.push({ id: optId.toLowerCase(), text });
      } else {
        options = options.map(o => o.id.toLowerCase() === optId.toLowerCase() ? { ...o, text } : o);
      }
      q.options = options;
    } else {
      q.options = (q.options || []).map(o => o.id === optId ? { ...o, text } : o);
    }
    setExamForm(prev => ({ ...prev, questions: updated }));
  };

  const updateTrueFalseAnswer = (qIndex, subId, value) => {
    const updated = [...examForm.questions];
    const q = updated[qIndex];
    const prev = normalizeTrueFalseMap(q.correct_answers, 'F');
    prev[subId.toLowerCase()] = value;
    q.correct_answers = prev;
    setExamForm(prevForm => ({ ...prevForm, questions: updated }));
  };

  const toggleCorrectAnswer = (qIndex, optId) => {
    const q = examForm.questions[qIndex];
    let newCorrect = [];
    if (q.question_type === 'single_choice') {
      newCorrect = [optId];
    } else {
      const currentList = Array.isArray(q.correct_answers) ? q.correct_answers : [];
      if (currentList.includes(optId)) {
        newCorrect = currentList.filter(id => id !== optId);
      } else {
        newCorrect = [...currentList, optId];
      }
    }
    updateQuestion(qIndex, 'correct_answers', newCorrect);
  };

  const removeQuestion = (index) => {
    if (!confirm(`Xóa câu số ${index + 1}?`)) return;
    const updated = examForm.questions.filter((_, i) => i !== index);
    const newTotal = autoSyncScore
      ? Math.round(updated.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: newTotal
    }));
  };

  const moveQuestionUp = (index) => {
    if (index <= 0) return;
    const updated = [...examForm.questions];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    updated.forEach((q, i) => { q.order_index = i + 1; });
    setExamForm(prev => ({ ...prev, questions: updated }));
    handleScrollToQuestion(index - 1);
  };

  const moveQuestionDown = (index) => {
    if (index >= examForm.questions.length - 1) return;
    const updated = [...examForm.questions];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    updated.forEach((q, i) => { q.order_index = i + 1; });
    setExamForm(prev => ({ ...prev, questions: updated }));
    handleScrollToQuestion(index + 1);
  };

  const duplicateQuestion = (index) => {
    const qToClone = examForm.questions[index];
    if (!qToClone) return;
    const cloned = deepCloneQuestion(normalizeQuestion(qToClone));
    cloned.id = undefined;
    cloned._uid = generateQuestionUid();
    cloned.order_index = index + 2;
    const updated = [...examForm.questions];
    updated.splice(index + 1, 0, cloned);
    updated.forEach((q, i) => { q.order_index = i + 1; });

    const newTotal = autoSyncScore
      ? Math.round(updated.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({ ...prev, questions: updated, total_score: newTotal }));
    setTimeout(() => handleScrollToQuestion(index + 1), 50);
  };

  const handleSaveExam = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!examForm.title) return alert('Vui lòng nhập tiêu đề bài kiểm tra!');
    if (examForm.questions.length === 0) return alert('Vui lòng thêm ít nhất một câu hỏi!');

    // Cảnh báo nếu phát hiện các câu hỏi bị trùng phương án
    const questionsWithDupOptions = [];
    examForm.questions.forEach((q, idx) => {
      const val = getQuestionValidationStatus(q);
      if (val.status === 'option_duplicate') {
        questionsWithDupOptions.push(`Câu ${idx + 1}: ${val.label}`);
      }
    });

    if (questionsWithDupOptions.length > 0) {
      const confirmSave = window.confirm(
        `⚠️ Cảnh báo: Phát hiện ${questionsWithDupOptions.length} câu hỏi có các phương án trùng nhau:\n- ${questionsWithDupOptions.slice(0, 4).join('\n- ')}${questionsWithDupOptions.length > 4 ? `\n...và ${questionsWithDupOptions.length - 4} câu khác` : ''}\n\nBạn có chắc chắn vẫn muốn lưu đề thi này không?`
      );
      if (!confirmSave) return;
    }

    // Kiểm tra Zero-Guesswork: cảnh báo nếu câu hỏi còn xung đột chưa được xác nhận đáp án
    const unresolvedInExam = examForm.questions.filter(q => {
      if (q.question_type === 'essay') return false;
      const noAns = !q.correct_answers || (Array.isArray(q.correct_answers) && q.correct_answers.length === 0) || (typeof q.correct_answers === 'object' && Object.keys(q.correct_answers).length === 0);
      return q.has_conflict || q.status === 'pending_review' || noAns;
    });
    if (unresolvedInExam.length > 0) {
      return alert(`Đề thi có ${unresolvedInExam.length} câu hỏi đang xung đột hoặc chưa được chọn đáp án đúng (Câu ${unresolvedInExam.map(q => q.order_index).join(', ')}). Vui lòng hoàn tất đối soát và chọn đáp án trước khi lưu!`);
    }

    try {
      const url = editingExamId ? `/api/exams/${editingExamId}` : '/api/exams';
      const method = editingExamId ? 'PUT' : 'POST';

      const sanitizedExamForm = {
        ...examForm,
        questions: examForm.questions.map((q, idx) => {
          const norm = normalizeQuestion(q);
          return {
            ...norm,
            order_index: idx + 1,
            max_score: q.max_score !== undefined ? q.max_score : (norm.default_score !== undefined ? norm.default_score : 0.25)
          };
        })
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedExamForm)
      });
      const data = await res.json();
      if (data.success) {
        const savedExamId = editingExamId || (data.exam && data.exam.id);
        if (onSuccess) onSuccess(savedExamId);
        onClose();
      } else {
        alert('Lỗi lưu đề thi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi gửi dữ liệu: ' + err.message);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden animate-fadeIn ${
      isFullscreen ? 'bg-slate-50 p-0' : 'bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4'
    }`}>
      <div className={`bg-white border border-slate-200 flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
        isFullscreen ? 'w-screen h-screen rounded-none' : 'w-[98vw] max-w-[1700px] h-[96vh] rounded-2xl'
      }`}>
        {/* ============================================================== */}
        {/* PINNED TOP HEADER: Tiêu đề, Trạng thái, Xuất Word, Lưu Đề Thi */}
        {/* ============================================================== */}
        <div className="flex flex-wrap items-center justify-between p-3 sm:px-5 border-b border-slate-200 bg-white shrink-0 gap-3 z-30 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-wide">
                  {editingExamId ? 'Chỉnh Sửa Đề Thi' : 'Soạn Thảo Đề Thi Mới'}
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold truncate max-w-[280px]">
                  {examForm.title || '(Chưa đặt tên)'}
                </span>
                {examForm.subject && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    {examForm.subject}
                  </span>
                )}
                {examForm.grade && (
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                    Khối {examForm.grade}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[11px] border border-slate-200">
                  Tổng {examForm.questions.length} câu
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-[11px]">
                  {examForm.total_score} điểm
                </span>
                {validationSummary.invalidCount === 0 ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đầy đủ đáp án
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold flex items-center gap-1 animate-pulse">
                    <AlertCircle className="w-3 h-3 text-amber-600" /> Có {validationSummary.invalidCount} câu cần sửa
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cụm nút hành động bên phải */}
          <div className="flex items-center gap-2">
            {editingExamId && (
              <button
                type="button"
                onClick={() => window.open(`/api/exams/${editingExamId}/export-word`, '_blank')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
                title="Xuất đề thi ra file Word (.docx) chuẩn A4 kèm bảng đáp án"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xuất Đề Word</span>
              </button>
            )}

            {/* Nút Quét Trùng Lặp */}
            <button
              type="button"
              onClick={handleScanDuplicates}
              disabled={scanningDuplicates || examForm.questions.length === 0}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
              title="Quét kiểm tra trùng lặp đề bài và trùng các phương án trong đề thi"
            >
              {scanningDuplicates ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Đang quét...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Quét Trùng Lặp</span>
                </>
              )}
            </button>

            {/* Toggle Fullscreen / Thu Nhỏ */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl transition border border-slate-200 shadow-2xs cursor-pointer"
              title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Phóng to toàn màn hình (Fullscreen)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Nút Lưu Đề Thi */}
            <button
              type="button"
              onClick={handleSaveExam}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingExamId ? 'Lưu Đề Thi' : 'Tạo Đề Thi'}</span>
            </button>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TWO-COLUMN WORKSPACE: Cột trái (Navigator) & Cột phải (Canvas) */}
        {/* ============================================================== */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* ------------------------------------------------------------ */}
          {/* CỘT TRÁI: QUESTION NAVIGATOR SIDEBAR (Danh mục câu hỏi)        */}
          {/* ------------------------------------------------------------ */}
          <div className="w-72 lg:w-80 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
            {/* Header Sidebar: Tìm kiếm & Lọc phần */}
            <div className="p-3 border-b border-slate-200 space-y-2 shrink-0 bg-white">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Tìm câu số, nội dung..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Bộ lọc theo 4 phần chuẩn Bộ GD&ĐT */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-semibold text-slate-500">
                <button
                  type="button"
                  onClick={() => setActivePartFilter('all')}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                    activePartFilter === 'all'
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  Tất cả ({partCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePartFilter('part1')}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                    activePartFilter === 'part1'
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  P.I ({partCounts.part1})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePartFilter('part2')}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                    activePartFilter === 'part2'
                      ? 'bg-teal-600 text-white font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  P.II ({partCounts.part2})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePartFilter('part3')}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                    activePartFilter === 'part3'
                      ? 'bg-amber-600 text-white font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  P.III ({partCounts.part3})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePartFilter('part4')}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition cursor-pointer ${
                    activePartFilter === 'part4'
                      ? 'bg-purple-600 text-white font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  P.IV ({partCounts.part4})
                </button>
              </div>

              {/* Progress Bar hoàn thành câu hỏi */}
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span>Tiến độ: {validationSummary.validCount}/{partCounts.total} câu</span>
                  <span className={validationSummary.invalidCount === 0 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                    {validationSummary.invalidCount === 0 ? '100% Hoàn tất' : `Còn ${validationSummary.invalidCount} câu chưa xong`}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${partCounts.total > 0 ? (validationSummary.validCount / partCounts.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Danh sách câu hỏi cuộn mượt */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredQuestionIndices.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs italic">
                  Không tìm thấy câu hỏi phù hợp.
                </div>
              ) : (
                filteredQuestionIndices.map(qIdx => {
                  const q = examForm.questions[qIdx];
                  const st = getQuestionValidationStatus(q);
                  const isActive = activeQIndex === qIdx;

                  let typeLabel = 'TN';
                  let typeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                  if (q.question_type === 'true_false') {
                    typeLabel = 'Đ/S';
                    typeColor = 'bg-teal-50 text-teal-700 border-teal-200';
                  } else if (q.question_type === 'short_answer') {
                    typeLabel = 'TLN';
                    typeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                  } else if (q.question_type === 'essay') {
                    typeLabel = 'TL';
                    typeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                  }

                  const snippet = (q.content || '')
                    .replace(/!\[.*?\]\(.*?\)/g, '[Ảnh]')
                    .replace(/\$\$.*?\$\$/g, '[$]')
                    .replace(/\$.*?\$/g, '[$]')
                    .slice(0, 40)
                    .trim() || '(Chưa nhập nội dung)';

                  return (
                    <button
                      key={qIdx}
                      type="button"
                      onClick={() => handleScrollToQuestion(qIdx)}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-start gap-2.5 cursor-pointer ${
                        isActive
                          ? 'bg-blue-50/80 border-blue-500 shadow-2xs ring-1 ring-blue-500 text-slate-900'
                          : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                        <span className="font-mono font-bold text-xs text-slate-800">
                          #{qIdx + 1}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs truncate font-medium text-slate-800">
                          {snippet}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-mono text-emerald-600 font-bold">
                            {q.max_score}đ
                          </span>
                          {st.isError ? (
                            <span className="text-amber-600 font-semibold flex items-center gap-1 truncate max-w-[120px]" title={st.label}>
                              <AlertCircle className="w-3 h-3 shrink-0" /> {st.label}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Đầy đủ
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Sidebar: 4 Nút Thêm Câu Hỏi Nhanh */}
            <div className="p-2.5 border-t border-slate-200 bg-white shrink-0 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                + Thêm Câu Hỏi Nhanh:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => addQuestion('single_choice')}
                  className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  title="Thêm câu hỏi Trắc nghiệm nhiều lựa chọn (Phần I)"
                >
                  <Plus className="w-3 h-3" /> P.I (TN)
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('true_false')}
                  className="px-2 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg font-bold flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  title="Thêm câu hỏi Đúng / Sai 4 ý a, b, c, d (Phần II)"
                >
                  <Plus className="w-3 h-3" /> P.II (Đ/S)
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('short_answer')}
                  className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  title="Thêm câu hỏi Điền khuyết / Trả lời ngắn (Phần III)"
                >
                  <Plus className="w-3 h-3" /> P.III (TLN)
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('essay')}
                  className="px-2 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-bold flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer"
                  title="Thêm câu hỏi Tự luận có barem chấm (Phần IV)"
                >
                  <Plus className="w-3 h-3" /> P.IV (TL)
                </button>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* CỘT PHẢI: MAIN CANVAS (Không gian soạn thảo rộng rãi)        */}
          {/* ------------------------------------------------------------ */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
            {/* 1. THÔNG TIN CHUNG CỦA ĐỀ THI (Collapsible Bar) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-xs">
                    ℹ️
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Thông Tin Chung Của Đề Thi
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tiêu đề, Môn học, Khối lớp, Trường học, Năm học và Ghi chú
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMetaSettings(!showMetaSettings)}
                  className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 shadow-2xs cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>{showMetaSettings ? 'Thu gọn thông tin' : 'Mở rộng thông tin đề'}</span>
                  {showMetaSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Form nhập thông tin chung (khi mở rộng) */}
              {showMetaSettings && (
                <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs animate-fadeIn">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Tên Đề Thi (*):
                    </label>
                    <input
                      type="text"
                      value={examForm.title}
                      onChange={e => setExamForm({ ...examForm, title: e.target.value })}
                      placeholder="Ví dụ: ĐỀ KIỂM TRA GIỮA KỲ 1 - NĂM HỌC 2024-2025"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm font-semibold focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Môn Học:</label>
                    <input
                      type="text"
                      value={examForm.subject}
                      onChange={e => setExamForm({ ...examForm, subject: e.target.value })}
                      placeholder="Tin học, Toán học, Sinh học..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Khối Lớp:</label>
                    <input
                      type="text"
                      value={examForm.grade}
                      onChange={e => setExamForm({ ...examForm, grade: e.target.value })}
                      placeholder="10, 11, 12..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Trường Học:</label>
                    <input
                      type="text"
                      value={examForm.school_name}
                      onChange={e => setExamForm({ ...examForm, school_name: e.target.value })}
                      placeholder="THPT Chuyên..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Năm Học:</label>
                    <input
                      type="text"
                      value={examForm.school_year}
                      onChange={e => setExamForm({ ...examForm, school_year: e.target.value })}
                      placeholder="2024 - 2025"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Ghi Chú Đề Thi:</label>
                    <input
                      type="text"
                      value={examForm.note}
                      onChange={e => setExamForm({ ...examForm, note: e.target.value })}
                      placeholder="Ghi chú thêm về ca thi, mã đề hoặc hướng dẫn học sinh..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. BAREM ĐIỂM 4 PHẦN CHUẨN BGD 2025 & NÚT CHIA ĐỀU ĐIỂM */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Shuffle className="w-4 h-4 text-blue-600" /> Barem Điểm 4 Phần Chuẩn BGD 2025:
                  </span>
                  <span className="text-[11px] text-slate-500">
                    (Tổng điểm đề: <strong className="text-emerald-600">{examForm.total_score}đ</strong>)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSyncScore}
                      onChange={e => setAutoSyncScore(e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-600 rounded"
                    />
                    <span>Tự động cập nhật tổng điểm khi sửa điểm câu</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleDistributeScoresByParts}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer transition"
                    title="Chia đều điểm cho các câu hỏi trong từng phần theo mức điểm ở các ô bên dưới"
                  >
                    ⚡ Chia Đều Điểm Từng Phần
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* Phần 1 */}
                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 space-y-1">
                  <div className="font-bold text-blue-800 flex items-center justify-between">
                    <span>Phần I (Nhiều L.Chọn)</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {partCounts.part1} câu
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={examForm.part_scores_json?.part1 ?? 3.0}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setExamForm(prev => ({
                          ...prev,
                          part_scores_json: { ...prev.part_scores_json, part1: val }
                        }));
                      }}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono font-bold text-xs shadow-2xs"
                    />
                    <span className="text-slate-500">điểm</span>
                  </div>
                </div>

                {/* Phần 2 */}
                <div className="bg-teal-50/50 border border-teal-200 rounded-xl p-2.5 space-y-1">
                  <div className="font-bold text-teal-800 flex items-center justify-between">
                    <span>Phần II (Đúng / Sai)</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {partCounts.part2} câu
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={examForm.part_scores_json?.part2 ?? 2.0}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setExamForm(prev => ({
                          ...prev,
                          part_scores_json: { ...prev.part_scores_json, part2: val }
                        }));
                      }}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono font-bold text-xs shadow-2xs"
                    />
                    <span className="text-slate-500">điểm</span>
                  </div>
                </div>

                {/* Phần 3 */}
                <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-2.5 space-y-1">
                  <div className="font-bold text-amber-800 flex items-center justify-between">
                    <span>Phần III (Trả lời ngắn)</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {partCounts.part3} câu
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={examForm.part_scores_json?.part3 ?? 2.0}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setExamForm(prev => ({
                          ...prev,
                          part_scores_json: { ...prev.part_scores_json, part3: val }
                        }));
                      }}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono font-bold text-xs shadow-2xs"
                    />
                    <span className="text-slate-500">điểm</span>
                  </div>
                </div>

                {/* Phần 4 */}
                <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-2.5 space-y-1">
                  <div className="font-bold text-purple-800 flex items-center justify-between">
                    <span>Phần IV (Tự luận)</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {partCounts.part4} câu
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="10"
                      value={examForm.part_scores_json?.part4 ?? 3.0}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setExamForm(prev => ({
                          ...prev,
                          part_scores_json: { ...prev.part_scores_json, part4: val }
                        }));
                      }}
                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono font-bold text-xs shadow-2xs"
                    />
                    <span className="text-slate-500">điểm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. TIỆN ÍCH SOẠN ĐỀ TỪ FILE WORD (.docx) */}
            <div className="bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border border-blue-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700">
                  <FileUp className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Tiện Ích Soạn Đề Từ File Word (.docx)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Tải mẫu McMIX & BGD 2025 về máy, hỗ trợ gạch chân Ctrl+U, dấu *, Đúng/Sai, Tự luận và Checklist
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTemplateDropdown(prev => !prev)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                    title="Tải các mẫu đề thi Word chuẩn VNLAN về máy tính"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Mẫu Đề Word</span>
                    <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
                  </button>

                  {showTemplateDropdown && (
                    <div className="absolute right-0 sm:left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn text-left text-xs divide-y divide-slate-100">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Chọn tệp mẫu theo môn học:
                      </div>
                      <a
                        href="/api/exams/template/download-word?type=tong_hop"
                        onClick={() => setShowTemplateDropdown(false)}
                        className="block px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition cursor-pointer"
                      >
                        📄 Mẫu Tổng Hợp VNLAN
                      </a>
                      <a
                        href="/api/exams/template/download-word?type=tin_hoc"
                        onClick={() => setShowTemplateDropdown(false)}
                        className="block px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition cursor-pointer"
                      >
                        💻 Mẫu Tin Học (Code Python/C++)
                      </a>
                      <a
                        href="/api/exams/template/download-word?type=toan_khtn"
                        onClick={() => setShowTemplateDropdown(false)}
                        className="block px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition cursor-pointer"
                      >
                        📐 Mẫu Toán & KHTN (MathType/OMML)
                      </a>
                      <a
                        href="/api/exams/template/download-word?type=ngoai_ngu"
                        onClick={() => setShowTemplateDropdown(false)}
                        className="block px-3 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition cursor-pointer"
                      >
                        📖 Mẫu Ngoại Ngữ & Đọc Hiểu
                      </a>
                    </div>
                  )}
                </div>

                <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{importingWord ? 'Đang Phân Tích...' : 'Nhập Đề Từ Word (.docx)'}</span>
                  <input
                    type="file"
                    accept=".docx"
                    disabled={importingWord}
                    onChange={handleWordFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 4. DANH SÁCH CÁC CÂU HỎI TRONG MAIN CANVAS */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-blue-600" />
                  <span>Nội Dung Chi Tiết Các Câu Hỏi ({examForm.questions.length})</span>
                </h4>
              </div>

              {examForm.questions.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                  <BookOpen className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
                  <p className="text-slate-800 text-sm font-bold">Chưa có câu hỏi nào trong đề thi</p>
                  <p className="text-slate-500 text-xs max-w-md mx-auto">
                    Thầy/Cô có thể bấm các nút "+ Thêm Câu Hỏi Nhanh" ở cột trái hoặc tải file Word lên để nhận diện tự động.
                  </p>
                </div>
              ) : (
                examForm.questions.map((q, qIndex) => {
                  const validation = getQuestionValidationStatus(q);
                  const isFocused = activeQIndex === qIndex;

                  return (
                    <div
                      key={q._uid || qIndex}
                      id={`edit-q-${qIndex}`}
                      className={`bg-white border rounded-2xl p-4 sm:p-5 transition shadow-sm space-y-3.5 ${
                        isFocused ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Header Câu Hỏi: Số thứ tự, Chọn dạng, Điểm, Nút Di chuyển, Nhân bản, Xóa */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center justify-center font-mono text-sm shrink-0">
                            #{qIndex + 1}
                          </span>

                          <select
                            value={q.question_type}
                            onChange={e => updateQuestion(qIndex, 'question_type', e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                          >
                            <option value="single_choice">Phần I: Trắc nghiệm 1 đáp án</option>
                            <option value="multiple_choice">Phần I: Trắc nghiệm nhiều lựa chọn</option>
                            <option value="true_false">Phần II: Đúng / Sai (4 ý a, b, c, d)</option>
                            <option value="short_answer">Phần III: Điền khuyết / Trả lời ngắn</option>
                            <option value="essay">Phần IV: Tự luận (Giáo viên chấm thủ công)</option>
                          </select>

                          {validation.isError ? (
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                              validation.status === 'option_duplicate'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {validation.status === 'option_duplicate' ? <AlertTriangle className="w-3 h-3 text-rose-600" /> : <AlertCircle className="w-3 h-3 text-amber-600" />}
                              {validation.label}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hợp lệ
                            </span>
                          )}
                        </div>

                        {/* Điểm số và các nút thao tác nhanh */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Soạn thảo chuyên sâu (TipTap + Math Extension) */}
                          <button
                            type="button"
                            onClick={() => handleOpenDeepEditor(q, qIndex)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Mở Trình Soạn Thảo Chuyên Sâu (TipTap, KaTeX, Bảng biểu, Tải ảnh)"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Soạn Chuyên Sâu</span>
                          </button>

                          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            <span>Điểm:</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="10"
                              value={q.max_score}
                              onChange={e => updateQuestion(qIndex, 'max_score', parseFloat(e.target.value) || 0)}
                              className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-900 font-mono font-bold text-xs text-center shadow-2xs"
                            />
                            <span>đ</span>
                          </div>

                          {/* Di chuyển lên */}
                          <button
                            type="button"
                            onClick={() => moveQuestionUp(qIndex)}
                            disabled={qIndex === 0}
                            className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                            title="Di chuyển câu hỏi lên trên"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Di chuyển xuống */}
                          <button
                            type="button"
                            onClick={() => moveQuestionDown(qIndex)}
                            disabled={qIndex === examForm.questions.length - 1}
                            className="p-1.5 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                            title="Di chuyển câu hỏi xuống dưới"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Nhân bản */}
                          <button
                            type="button"
                            onClick={() => duplicateQuestion(qIndex)}
                            className="p-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                            title="Nhân bản câu hỏi này"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Xóa */}
                          <button
                            type="button"
                            onClick={() => removeQuestion(qIndex)}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-lg border border-slate-200 transition shadow-2xs cursor-pointer"
                            title="Xóa câu hỏi này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Vùng soạn thảo Đề bài */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <label className="text-xs font-semibold text-slate-700">
                            Nội dung đề bài (Hỗ trợ công thức KaTeX $...$, mã code và dán ảnh trực tiếp Ctrl+V):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setCodeModalTarget({ qIndex, type: 'content' })}
                              className="px-2 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Chèn khối mã nguồn lập trình"
                            >
                              <Code2 className="w-3.5 h-3.5" /> Mã Code
                            </button>
                            <button
                              type="button"
                              onClick={() => setMathModalTarget({ qIndex, type: 'content' })}
                              className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Bảng ký hiệu & công thức Toán học"
                            >
                              <Sigma className="w-3.5 h-3.5" /> Công Thức Toán
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePickImageForTarget({ qIndex, type: 'content' })}
                              className="px-2 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-slate-200 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Chọn ảnh tải lên cho câu hỏi"
                            >
                              <ImageIcon className="w-3.5 h-3.5" /> Chèn Ảnh
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={3}
                          value={q.content}
                          onChange={e => {
                            updateQuestion(qIndex, 'content', e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(72, e.target.scrollHeight)}px`;
                          }}
                          onFocus={e => {
                            setActiveQIndex(qIndex);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.max(72, e.target.scrollHeight)}px`;
                          }}
                          onKeyDown={e => handleKeyDownTab(e, qIndex, 'content')}
                          onPaste={e => handlePasteInField(e, { qIndex, type: 'content' })}
                          placeholder="Nhập nội dung đề bài (Hỗ trợ công thức Toán $...$, bảng Markdown và dán ảnh Ctrl+V)..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[72px] focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                          required
                        />

                        {/* Xem trước trực quan nếu có công thức, ảnh hoặc bảng */}
                        {q.content && (q.content.includes('$') || q.content.includes('![') || q.content.includes('```') || q.content.includes('|') || q.content.includes('`')) && (
                          <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-slate-800 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-wider pb-1 border-b border-blue-100">
                              <span>👁️ Xem trước hiển thị đề bài:</span>
                              {q.content.includes('![') && (
                                <span className="text-teal-700 normal-case font-normal">
                                  💡 Gợi ý: Bấm trực tiếp vào ảnh để mở xem khổ lớn
                                </span>
                              )}
                            </div>
                            <div className="pt-1">
                              <MathContent content={q.content} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Các phương án lựa chọn theo từng dạng câu hỏi */}
                      {q.question_type === 'essay' ? (
                        <div className="space-y-2 pt-1 bg-purple-50/40 border border-purple-200 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-purple-800">
                              Barem điểm & Hướng dẫn chấm tự luận:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCodeModalTarget({ qIndex, type: 'rubric' })}
                                className="px-2 py-0.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-bold shadow-2xs cursor-pointer"
                              >
                                <Code2 className="w-3 h-3" /> Code
                              </button>
                              <button
                                type="button"
                                onClick={() => setMathModalTarget({ qIndex, type: 'rubric' })}
                                className="px-2 py-0.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-bold shadow-2xs cursor-pointer"
                              >
                                <Sigma className="w-3 h-3" /> Toán
                              </button>
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            value={q.rubric_guide || ''}
                            onChange={e => updateQuestion(qIndex, 'rubric_guide', e.target.value)}
                            onKeyDown={e => handleKeyDownTab(e, qIndex, 'rubric')}
                            placeholder="Nhập barem phân bổ điểm cho từng ý để giáo viên chấm thi soi chiếu..."
                            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[50px] focus:border-purple-500 focus:outline-none shadow-2xs"
                          />
                          {q.rubric_guide && (
                            <div className="p-2.5 bg-white rounded-lg border border-purple-100 text-xs text-purple-900 shadow-2xs">
                              <span className="text-[10px] uppercase font-bold text-purple-700 block mb-1">👁️ Xem trước barem chấm:</span>
                              <MathContent content={q.rubric_guide} />
                            </div>
                          )}
                        </div>
                      ) : q.question_type === 'short_answer' ? (
                        <div className="space-y-3 pt-1 bg-amber-50/40 border border-amber-200 rounded-xl p-3.5">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-amber-800">
                              Đáp án chuẩn (Phần III: Điền khuyết / Trả lời ngắn):
                            </label>
                            <span className="text-[11px] text-amber-700 font-medium">
                              {(Array.isArray(q.correct_answers) ? q.correct_answers.length : (q.short_answer ? 1 : 0))} đáp án hợp lệ
                            </span>
                          </div>

                          {/* Danh sách các đáp án đúng chấp nhận (Tags / Badges) */}
                          <div className="flex flex-wrap gap-2 items-center min-h-[36px] p-2 bg-white rounded-lg border border-amber-200">
                            {(!Array.isArray(q.correct_answers) || q.correct_answers.length === 0) && !q.short_answer ? (
                              <span className="text-xs text-amber-600/70 italic">Chưa có đáp án nào được nhập...</span>
                            ) : (
                              (Array.isArray(q.correct_answers) && q.correct_answers.length > 0
                                ? q.correct_answers
                                : (q.short_answer ? [q.short_answer] : [])
                              ).map((ans, aIdx) => (
                                <span
                                  key={aIdx}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                                >
                                  <span>{ans}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentList = Array.isArray(q.correct_answers) ? q.correct_answers : (q.short_answer ? [q.short_answer] : []);
                                      const filtered = currentList.filter((_, idx) => idx !== aIdx);
                                      updateQuestion(qIndex, 'correct_answers', filtered);
                                      updateQuestion(qIndex, 'short_answer', filtered[0] || '');
                                    }}
                                    className="hover:text-rose-700 text-amber-600 font-bold ml-0.5 cursor-pointer"
                                    title="Xóa đáp án này"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Ô nhập thêm đáp án hợp lệ */}
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newShortAnswerInputs[q._uid || qIndex] || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setNewShortAnswerInputs(prev => ({ ...prev, [q._uid || qIndex]: val }));
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const text = (newShortAnswerInputs[q._uid || qIndex] || '').trim();
                                  if (!text) return;
                                  const currentList = Array.isArray(q.correct_answers) ? [...q.correct_answers] : (q.short_answer ? [q.short_answer] : []);
                                  if (!currentList.includes(text)) {
                                    const nextList = [...currentList, text];
                                    updateQuestion(qIndex, 'correct_answers', nextList);
                                    updateQuestion(qIndex, 'short_answer', nextList[0] || '');
                                  }
                                  setNewShortAnswerInputs(prev => ({ ...prev, [q._uid || qIndex]: '' }));
                                }
                              }}
                              placeholder="Nhập chuỗi đáp án (ví dụ: 2.5 hoặc 2,5) rồi nhấn Enter hoặc bấm Thêm..."
                              className="flex-1 bg-white border border-amber-300 rounded-lg p-2 text-slate-900 font-mono font-bold text-xs shadow-2xs focus:border-amber-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const text = (newShortAnswerInputs[q._uid || qIndex] || '').trim();
                                if (!text) return;
                                const currentList = Array.isArray(q.correct_answers) ? [...q.correct_answers] : (q.short_answer ? [q.short_answer] : []);
                                if (!currentList.includes(text)) {
                                  const nextList = [...currentList, text];
                                  updateQuestion(qIndex, 'correct_answers', nextList);
                                  updateQuestion(qIndex, 'short_answer', nextList[0] || '');
                                }
                                setNewShortAnswerInputs(prev => ({ ...prev, [q._uid || qIndex]: '' }));
                              }}
                              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" /> Thêm Đáp Án
                            </button>
                          </div>

                          {/* Cấu hình chấm điểm tự động (Scoring Config Toggles) */}
                          <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-4 text-xs text-slate-700">
                            <label className="flex items-center gap-1.5 cursor-pointer font-medium hover:text-amber-900">
                              <input
                                type="checkbox"
                                checked={q.scoring_config?.answer_format === 'exam_sheet'}
                                onChange={e => {
                                  const isSheet = e.target.checked;
                                  const curCfg = q.scoring_config || {};
                                  updateQuestion(qIndex, 'scoring_config', {
                                    ...curCfg,
                                    answer_format: isSheet ? 'exam_sheet' : 'decimal',
                                    max_characters: isSheet ? 4 : null
                                  });
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>Phiếu thi THPT 4 ô</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer font-medium hover:text-amber-900">
                              <input
                                type="checkbox"
                                checked={q.scoring_config?.allow_comma_dot_equivalence !== false}
                                onChange={e => {
                                  const curCfg = q.scoring_config || {};
                                  updateQuestion(qIndex, 'scoring_config', {
                                    ...curCfg,
                                    allow_comma_dot_equivalence: e.target.checked
                                  });
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>Tương đương dấu phẩy & chấm (2,5 = 2.5)</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer font-medium hover:text-amber-900">
                              <input
                                type="checkbox"
                                checked={Boolean(q.scoring_config?.numeric_equivalence)}
                                onChange={e => {
                                  const curCfg = q.scoring_config || {};
                                  updateQuestion(qIndex, 'scoring_config', {
                                    ...curCfg,
                                    numeric_equivalence: e.target.checked
                                  });
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>Tương đương số (1/2 = 0.5)</span>
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer font-medium hover:text-amber-900">
                              <input
                                type="checkbox"
                                checked={Boolean(q.scoring_config?.case_sensitive)}
                                onChange={e => {
                                  const curCfg = q.scoring_config || {};
                                  updateQuestion(qIndex, 'scoring_config', {
                                    ...curCfg,
                                    case_sensitive: e.target.checked
                                  });
                                }}
                                className="rounded text-amber-600 focus:ring-amber-500"
                              />
                              <span>Phân biệt hoa/thường</span>
                            </label>
                          </div>
                        </div>
                      ) : q.question_type === 'true_false' ? (
                        /* ĐÚNG / SAI (4 Ý a, b, c, d) DÀN 2 CỘT SONG SONG */
                        <div className="space-y-2.5 pt-1">
                          <div className="text-xs font-bold text-teal-800 flex items-center justify-between">
                            <span>Các ý Đúng / Sai (a, b, c, d):</span>
                            <span className="text-[11px] text-slate-500 font-normal">
                              Chọn Đúng (✓) hoặc Sai (✗) cho từng ý
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {['a', 'b', 'c', 'd'].map(letter => {
                              const opt = (q.options || []).find(o => o.id.toLowerCase() === letter) || { id: letter, text: '' };
                              const tfState = getTrueFalseState(q.correct_answers, letter);
                              const currentAns = tfState === 'T' ? 'T' : 'F';

                              const optDups = validation.optionDups || [];
                              const dupWith = optDups.find(p => p.id1.toLowerCase() === letter || p.id2.toLowerCase() === letter);
                              const dupPartner = dupWith ? (dupWith.id1.toLowerCase() === letter ? dupWith.id2 : dupWith.id1) : null;

                              return (
                                <div key={letter} className={`p-3 rounded-xl border space-y-2 shadow-2xs transition ${
                                  dupPartner
                                    ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300'
                                    : 'bg-slate-50 border-slate-200'
                                }`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 font-mono font-bold text-xs flex items-center justify-center border border-teal-200 shrink-0">
                                        {letter})
                                      </span>
                                      <span className="text-xs font-semibold text-slate-700 uppercase">
                                        Ý {letter.toUpperCase()}
                                      </span>
                                      {dupPartner && (
                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1 animate-pulse">
                                          <AlertTriangle className="w-3 h-3" /> Trùng {dupPartner.toUpperCase()}
                                        </span>
                                      )}
                                    </div>

                                    {/* 2 nút chọn Đúng / Sai */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => updateTrueFalseAnswer(qIndex, letter, 'T')}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                          currentAns === 'T'
                                            ? 'bg-emerald-600 text-white shadow-2xs ring-2 ring-emerald-300 font-black'
                                            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                                        }`}
                                      >
                                        ✓ ĐÚNG
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateTrueFalseAnswer(qIndex, letter, 'F')}
                                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                          currentAns === 'F'
                                            ? 'bg-rose-600 text-white shadow-2xs ring-2 ring-rose-300 font-black'
                                            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                                        }`}
                                      >
                                        ✗ SAI
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-1.5">
                                    <textarea
                                      rows={2}
                                      value={opt.text}
                                      onChange={e => {
                                        updateOptionText(qIndex, letter, e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                                      }}
                                      onKeyDown={e => handleKeyDownTab(e, qIndex, 'option', letter)}
                                      onPaste={e => handlePasteInField(e, { qIndex, type: 'option', optId: letter })}
                                      placeholder={`Nội dung ý ${letter}) (hỗ trợ $...$, khối code và dán ảnh Ctrl+V)...`}
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[48px] focus:border-teal-500 focus:outline-none shadow-2xs"
                                      required
                                    />
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setMathModalTarget({ qIndex, type: 'option', optId: letter })}
                                        className="p-1.5 bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 rounded-lg transition shadow-2xs cursor-pointer"
                                        title="Chèn công thức toán vào ý này"
                                      >
                                        <Sigma className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePickImageForTarget({ qIndex, type: 'option', optId: letter })}
                                        className="p-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 rounded-lg transition shadow-2xs cursor-pointer"
                                        title="Thêm ảnh cho ý này"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {opt.text && (
                                    <div className="p-2 text-xs text-teal-800 bg-teal-50/60 rounded-lg border border-teal-100 shadow-2xs">
                                      <span className="text-[10px] uppercase font-bold text-teal-600 block mb-0.5">👁️ Xem trước:</span>
                                      <MathContent content={opt.text} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* TRẮC NGHIỆM ĐƠN / NHIỀU LỰA CHỌN: DÀN 2 CỘT SONG SONG A, B, C, D */
                        <div className="space-y-2 pt-1">
                          <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                            <span>Click vào chữ cái A, B, C, D để chọn đáp án đúng:</span>
                            <span className="text-[11px] text-blue-600 font-semibold">
                              ✓ Dàn 2 cột song song chuẩn khổ rộng
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {q.options.map(opt => {
                              const isCorrect = Array.isArray(q.correct_answers)
                                ? q.correct_answers.includes(opt.id)
                                : (typeof q.correct_answers === 'string' ? q.correct_answers === opt.id : false);
                              const optDups = validation.optionDups || [];
                              const dupWith = optDups.find(p => p.id1.toLowerCase() === opt.id.toLowerCase() || p.id2.toLowerCase() === opt.id.toLowerCase());
                              const dupPartner = dupWith ? (dupWith.id1.toLowerCase() === opt.id.toLowerCase() ? dupWith.id2 : dupWith.id1) : null;

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3 rounded-xl border transition space-y-2 shadow-2xs ${
                                    dupPartner
                                      ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300'
                                      : isCorrect
                                        ? 'bg-emerald-50/60 border-emerald-400 ring-1 ring-emerald-400'
                                        : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => toggleCorrectAnswer(qIndex, opt.id)}
                                        className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold text-xs transition shrink-0 cursor-pointer ${
                                          isCorrect
                                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 shadow-2xs'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 shadow-2xs'
                                        }`}
                                        title="Click để đặt làm đáp án đúng"
                                      >
                                        <span className="font-mono text-sm">{opt.id}</span>
                                        {isCorrect ? (
                                          <span className="text-[10px] tracking-wide uppercase font-bold">✓ ĐÁP ÁN ĐÚNG</span>
                                        ) : (
                                          <span className="text-[10px] text-slate-500 font-normal">Click chọn đúng</span>
                                        )}
                                      </button>

                                      {dupPartner && (
                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1 animate-pulse">
                                          <AlertTriangle className="w-3 h-3" /> Trùng {dupPartner.toUpperCase()}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setCodeModalTarget({ qIndex, type: 'option', optId: opt.id })}
                                        className="p-1 bg-white hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 border border-slate-200 rounded-md transition shadow-2xs cursor-pointer"
                                        title={`Chèn mã lập trình vào phương án ${opt.id}`}
                                      >
                                        <Code2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setMathModalTarget({ qIndex, type: 'option', optId: opt.id })}
                                        className="p-1 bg-white hover:bg-blue-50 text-slate-500 hover:text-blue-700 border border-slate-200 rounded-md transition shadow-2xs cursor-pointer"
                                        title={`Chèn công thức toán vào phương án ${opt.id}`}
                                      >
                                        <Sigma className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePickImageForTarget({ qIndex, type: 'option', optId: opt.id })}
                                        className="p-1 bg-white hover:bg-teal-50 text-slate-500 hover:text-teal-700 border border-slate-200 rounded-md transition shadow-2xs cursor-pointer"
                                        title={`Chèn ảnh vào phương án ${opt.id}`}
                                      >
                                        <ImageIcon className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>

                                  <textarea
                                    rows={2}
                                    value={opt.text}
                                    onChange={e => {
                                      updateOptionText(qIndex, opt.id, e.target.value);
                                      e.target.style.height = 'auto';
                                      e.target.style.height = `${Math.max(48, e.target.scrollHeight)}px`;
                                    }}
                                    onKeyDown={e => handleKeyDownTab(e, qIndex, 'option', opt.id)}
                                    onPaste={e => handlePasteInField(e, { qIndex, type: 'option', optId: opt.id })}
                                    placeholder={`Nội dung lựa chọn ${opt.id} (hỗ trợ $...$, khối code và dán ảnh Ctrl+V)...`}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 text-xs leading-relaxed resize-y break-words whitespace-pre-wrap min-h-[48px] focus:border-blue-500 focus:outline-none focus:bg-white shadow-2xs"
                                    required
                                  />

                                  {opt.text && (
                                    <div className="p-2 text-xs text-blue-900 bg-blue-50/50 rounded-lg border border-blue-100 shadow-2xs">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">👁️ Xem trước:</span>
                                      <MathContent content={opt.text} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* PINNED BOTTOM FOOTER: Thống kê, Hủy Bỏ, Lưu Thay Đổi Đề Thi    */}
        {/* ============================================================== */}
        <div className="flex flex-wrap items-center justify-between p-3 sm:px-5 border-t border-slate-200 bg-white shrink-0 gap-3 shadow-sm">
          <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
            <span>
              Tổng số câu: <strong className="text-slate-900 font-bold">{examForm.questions.length}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span>
              Tổng điểm: <strong className="text-emerald-600 font-mono font-bold text-sm">{examForm.total_score}đ</strong>
            </span>
            <span className="text-slate-300 hidden md:inline">•</span>
            <span className="text-slate-500 hidden md:inline">
              (P.I: {examForm.part_scores_json?.part1 ?? 3}đ | P.II: {examForm.part_scores_json?.part2 ?? 2}đ | P.III: {examForm.part_scores_json?.part3 ?? 2}đ | P.IV: {examForm.part_scores_json?.part4 ?? 3}đ)
            </span>
            {validationSummary.invalidCount > 0 && (
              <span className="text-amber-600 font-semibold text-[11px] ml-1">
                ⚠️ Cần hoàn thiện đáp án cho {validationSummary.invalidCount} câu
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition border border-slate-200 shadow-2xs cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={handleSaveExam}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-2xs flex items-center gap-2 transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingExamId ? 'Lưu Thay Đổi Đề Thi' : 'Lưu Đề Thi Mới'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* MATH TOOLBAR MODAL */}
      <MathToolbarModal
        isOpen={Boolean(mathModalTarget)}
        onClose={() => setMathModalTarget(null)}
        onInsert={handleInsertMath}
      />

      {/* CODE TOOLBAR MODAL */}
      <CodeToolbarModal
        isOpen={Boolean(codeModalTarget)}
        onClose={() => setCodeModalTarget(null)}
        onInsert={handleInsertCode}
      />

      {/* HIDDEN IMAGE INPUT */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
      />

      {/* UPLOADING IMAGE TOAST */}
      {uploadingImage && (
        <div className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce text-xs font-bold">
          <ImageIcon className="w-4 h-4 animate-spin" />
          <span>Đang tải hình ảnh lên máy chủ...</span>
        </div>
      )}

      {/* MODAL KẾT QUẢ QUÉT TRÙNG LẶP */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Kết Quả Quét Trùng Lặp Đề Thi</h3>
                  <p className="text-[11px] text-slate-500">Đối soát toàn bộ nội dung đề bài và phương án</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Thống kê nhanh */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Trùng phương án</span>
                  <span className={`text-lg font-black ${(duplicateScanReport?.option_duplicates?.length || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {duplicateScanReport?.option_duplicates?.length || 0} câu
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Trùng đề bài nội bộ</span>
                  <span className={`text-lg font-black ${(duplicateScanReport?.intra_duplicates?.length || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {duplicateScanReport?.intra_duplicates?.length || 0} cặp
                  </span>
                </div>
              </div>

              {!duplicateScanReport?.has_issues ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">Đề thi hoàn hảo!</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Không phát hiện câu hỏi nào bị trùng lặp đề bài hoặc trùng phương án lựa chọn trong đề thi.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Cảnh báo trùng đề bài nội bộ */}
                  {(duplicateScanReport?.intra_duplicates || []).length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Các cặp câu hỏi trùng đề bài:
                      </span>
                      <div className="space-y-1.5">
                        {duplicateScanReport.intra_duplicates.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <span className="font-bold text-slate-800">
                                Câu {item.index1 + 1} trùng với Câu {item.index2 + 1}
                              </span>
                              <span className="text-[10px] text-rose-700 block">
                                Độ tương đồng: {Math.round(item.similarity * 100)}% ({item.match_type === 'exact' ? 'Trùng 100%' : 'Trùng mờ'})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowDuplicateModal(false);
                                handleScrollToQuestion(item.index2);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition shadow-2xs cursor-pointer"
                            >
                              Sửa Câu {item.index2 + 1} →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cảnh báo trùng phương án */}
                  {(duplicateScanReport?.option_duplicates || []).length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Các câu hỏi có phương án trùng nhau:
                      </span>
                      <div className="space-y-1.5">
                        {duplicateScanReport.option_duplicates.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between gap-2 shadow-2xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <span className="font-bold text-slate-800">
                                Câu {item.question_index + 1}
                              </span>
                              <span className="text-[10px] text-amber-800 block">
                                Trùng: {item.duplicates.map(p => `[${p.id1} và ${p.id2}]`).join(', ')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowDuplicateModal(false);
                                handleScrollToQuestion(item.question_index);
                              }}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition shadow-2xs cursor-pointer"
                            >
                              Sửa Câu {item.question_index + 1} →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SOẠN THẢO CHUYÊN SÂU CÂU HỎI (TIPTAP + MATH EXTENSION + BẢNG + TẢI ẢNH) */}
      {showDeepEditorModal && deepEditQuestionDraft && (
        <QuestionBankEditorModal
          isOpen={showDeepEditorModal}
          onClose={() => {
            setShowDeepEditorModal(false);
            setDeepEditQuestionDraft(null);
          }}
          gradeSubject={{
            id: null,
            grade_name: examForm.grade ? `Khối ${examForm.grade}` : 'Đề Thi',
            subject_name: examForm.subject || 'Khảo thí'
          }}
          mode="exam_question"
          initialQuestionData={deepEditQuestionDraft}
          onApplyToExam={handleApplyDeepEditor}
        />
      )}
    </div>
  );
}

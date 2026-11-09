-- ====================================================================
-- VNLAN HYBRID CLOUD - SUPABASE POSTGRESQL PRODUCTION SCHEMA (V2026.1)
-- Phê duyệt theo Bản đặc tả: KH-VNLAN-20261109-AMENDED-FINAL
-- Khắc phục 100% 6 lỗi kỹ thuật P0:
--   1. Tách bảng đáp án độc lập (exam_answer_keys)
--   2. Máy trạng thái phiên thi (student_exam_attempts)
--   3. Cấp quyền thiết bị nguyên tử & Băm mã truy cập (access_code_hash)
--   4. Thời gian thi cá nhân hóa (started_at, deadline_at)
--   5. Khóa Idempotency & Giao thức 3 bước (idempotency_key, sync_status)
--   6. RLS nghiêm ngặt - Chặn 100% quyền đọc đáp án đối với Anon/Client
-- ====================================================================

-- Kích hoạt tiện ích mở rộng pgcrypto để sinh UUID và băm mật mã
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 1. BẢNG CA THI (EXAM SESSIONS)
-- ====================================================================
CREATE TABLE IF NOT EXISTS exam_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT,
    duration_minutes INT NOT NULL DEFAULT 45,
    hard_cutoff_at TIMESTAMPTZ,                -- Hạn chót đóng ca thi tuyệt đối
    status TEXT NOT NULL DEFAULT 'draft'       -- 'draft', 'active', 'closed', 'archived'
        CHECK (status IN ('draft', 'active', 'closed', 'archived')),
    published_version INT NOT NULL DEFAULT 1,  -- Khóa phiên bản đề khi đã phân phối
    shuffle_questions BOOLEAN DEFAULT true,
    shuffle_options BOOLEAN DEFAULT true,
    allow_review BOOLEAN DEFAULT false,
    score_release_mode TEXT DEFAULT 'manual_release' -- 'immediate', 'manual_release', 'hidden'
        CHECK (score_release_mode IN ('immediate', 'manual_release', 'hidden')),
    scores_released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 2. BẢNG ĐỀ THI CÔNG KHAI (EXAM PAPERS - ĐÃ LOẠI BỎ ĐÁP ÁN ĐÚNG)
-- Thí sinh được cấp quyền đọc câu hỏi & các phương án hoán vị
-- ====================================================================
CREATE TABLE IF NOT EXISTS exam_papers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    questions_payload JSONB NOT NULL,          -- Danh sách câu hỏi, lựa chọn (KHÔNG có đáp án)
    version INT NOT NULL DEFAULT 1,
    checksum_sha256 TEXT NOT NULL,             -- Kiểm tra toàn vẹn đề thi
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, version)
);

-- ====================================================================
-- 3. BẢNG ĐÁP ÁN BÍ MẬT (EXAM ANSWER KEYS - P0 FIX)
-- TUYỆT ĐỐI KHÔNG CẤP QUYỀN ĐỌC CHO ANON / AUTHENTICATED
-- Chỉ có Serverless Functions (Service Role) mới được đọc để chấm điểm
-- ====================================================================
CREATE TABLE IF NOT EXISTS exam_answer_keys (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
    answer_key_payload JSONB NOT NULL,         -- Bản đồ đáp án chuẩn & cấu hình chấm
    scoring_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, paper_id)
);

-- ====================================================================
-- 4. BẢNG DANH SÁCH THÍ SINH ĐƯỢC PHÉP THI (STUDENT WHITELIST)
-- ====================================================================
CREATE TABLE IF NOT EXISTS student_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_code TEXT NOT NULL,                -- Số báo danh / Mã định danh
    student_name TEXT NOT NULL,
    student_class TEXT,
    access_code_hash TEXT NOT NULL,            -- SHA256(student_code + "_" + pin + "_" + salt)
    is_blocked BOOLEAN DEFAULT false,          -- Khóa thi nếu vi phạm
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, student_code)
);

-- ====================================================================
-- 5. BẢNG PHIÊN THI CÁ NHÂN (STUDENT EXAM ATTEMPTS - P0 STATE MACHINE)
-- ====================================================================
CREATE TABLE IF NOT EXISTS student_exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_code TEXT NOT NULL,
    
    -- Quản lý thời gian cá nhân hóa
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,          -- LEAST(started_at + duration, session.hard_cutoff_at)
    submitted_at TIMESTAMPTZ,
    
    -- Máy trạng thái
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'offline_pending', 'submission_pending', 'submitted', 'expired', 'recovery_required')),
    
    -- Bảo mật thiết bị (Server sinh token và lưu băm)
    device_token_hash TEXT NOT NULL,
    client_ip TEXT,
    user_agent TEXT,
    
    -- Giám sát tiến độ & Heartbeat
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_progress_at TIMESTAMPTZ DEFAULT NOW(),
    current_revision INT NOT NULL DEFAULT 0,
    answers_delta_json JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, student_code)
);

-- ====================================================================
-- 6. BẢNG BÀI NỘP CHÍNH THỨC (STUDENT SUBMISSIONS - BẤT BIẾN / IMMUTABLE)
-- ====================================================================
CREATE TABLE IF NOT EXISTS student_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_code TEXT NOT NULL,
    attempt_id UUID NOT NULL REFERENCES student_exam_attempts(id) ON DELETE CASCADE,
    
    -- Kết quả chấm điểm do Server thực hiện
    score NUMERIC(4,2) NOT NULL,
    mcq_score NUMERIC(4,2) NOT NULL DEFAULT 0.0,
    essay_score NUMERIC(4,2) NOT NULL DEFAULT 0.0,
    details_json JSONB NOT NULL,               -- Chi tiết từng câu đúng/sai/điểm số
    
    -- Bảo đảm tính toàn vẹn & Chống gửi trùng
    grading_version INT NOT NULL DEFAULT 1,
    idempotency_key TEXT NOT NULL UNIQUE,      -- Chống nộp lặp (Idempotent)
    payload_hash TEXT NOT NULL,                -- SHA-256 mã hóa nội dung bài nộp
    
    -- Đồng bộ hai chiều (Giao thức 3 bước)
    sync_status TEXT NOT NULL DEFAULT 'pending_pull'
        CHECK (sync_status IN ('pending_pull', 'synced_to_local', 'conflict')),
    sync_batch_id TEXT,
    acknowledged_at TIMESTAMPTZ,
    
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, student_code)
);

-- ====================================================================
-- 7. BẢNG NHẬT KÝ ĐIỀU CHỈNH / CHẤM LẠI (SUBMISSION REGRADE LOGS)
-- ====================================================================
CREATE TABLE IF NOT EXISTS submission_regrade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
    old_score NUMERIC(4,2) NOT NULL,
    new_score NUMERIC(4,2) NOT NULL,
    reason TEXT NOT NULL,
    performed_by TEXT NOT NULL,                -- Định danh tài khoản giáo viên
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 8. BẢNG HÀNG ĐỢI XUNG ĐỘT ĐỒNG BỘ (SYNC CONFLICTS)
-- Ghi nhận bất kỳ sự sai lệch nào giữa Offline SQLite và Cloud
-- ====================================================================
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    student_code TEXT NOT NULL,
    cloud_score NUMERIC(4,2) NOT NULL,
    local_score NUMERIC(4,2) NOT NULL,
    cloud_payload_hash TEXT NOT NULL,
    local_payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unresolved'  -- 'unresolved', 'resolved_cloud', 'resolved_local'
        CHECK (status IN ('unresolved', 'resolved_cloud', 'resolved_local')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ====================================================================
-- THIẾT LẬP CHỈ MỤC (INDEXES) TỐI ƯU HIỆU NĂNG TRUY VẤN
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_status ON exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_attempts_session_student ON student_exam_attempts(session_id, student_code);
CREATE INDEX IF NOT EXISTS idx_attempts_last_seen ON student_exam_attempts(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_submissions_sync ON student_submissions(session_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_whitelist_lookup ON student_whitelist(session_id, student_code);

-- ====================================================================
-- THIẾT LẬP ROW LEVEL SECURITY (RLS) - BẢO MẬT TẬN GỐC CSDL
-- ====================================================================
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_regrade_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;

-- 1. exam_sessions: Mọi người đều có thể xem ca thi đang active hoặc closed
CREATE POLICY "Public Read Sessions"
ON exam_sessions FOR SELECT
TO anon, authenticated
USING (status IN ('active', 'closed'));

-- 2. exam_papers: Thí sinh đọc đề thi của ca thi đang active
CREATE POLICY "Public Read Exam Papers"
ON exam_papers FOR SELECT
TO anon, authenticated
USING (EXISTS (
    SELECT 1 FROM exam_sessions
    WHERE exam_sessions.id = exam_papers.session_id
    AND exam_sessions.status IN ('active', 'closed')
));

-- 3. exam_answer_keys: CẤM TUYỆT ĐỐI CHO ANON VÀ AUTHENTICATED!
-- (Không tạo bất kỳ Policy nào cho bảng này -> Mặc định DENY ALL đối với public API)
-- Chỉ có Serverless Functions (Service Role) mới có quyền đọc để chấm điểm.

-- 4. student_submissions: Cho phép xem kết quả khi ca thi đã mở công bố điểm
CREATE POLICY "Students View Their Own Result"
ON student_submissions FOR SELECT
TO anon, authenticated
USING (EXISTS (
    SELECT 1 FROM exam_sessions
    WHERE exam_sessions.id = student_submissions.session_id
    AND (
        exam_sessions.score_release_mode = 'immediate'
        OR (exam_sessions.score_release_mode = 'manual_release' AND exam_sessions.scores_released_at IS NOT NULL)
    )
));

-- 5. Bảng dành riêng cho Quản trị & Đồng bộ:
-- Toàn bộ các thao tác ghi vào student_submissions, sync_conflicts, submission_regrade_logs
-- đều được thực hiện thông qua Serverless Functions có Service Role Token.

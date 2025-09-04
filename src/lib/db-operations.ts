import { getDatabase, User, BatchJob, TranslationHistory } from './database';
import { randomUUID } from 'crypto';

// User operations
export const createUser = (sessionId: string, userAgent?: string, ipAddress?: string): User => {
  const db = getDatabase();
  const now = Date.now();
  const userId = `user_${now}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO users (id, session_id, created_at, last_active, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(userId, sessionId, now, now, userAgent, ipAddress);
  
  return {
    id: userId,
    session_id: sessionId,
    created_at: now,
    last_active: now,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
};

export const getUserBySessionId = (sessionId: string): User | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE session_id = ?');
  const user = stmt.get(sessionId) as User | undefined;
  
  if (user) {
    // Update last active time
    const updateStmt = db.prepare('UPDATE users SET last_active = ? WHERE id = ?');
    updateStmt.run(Date.now(), user.id);
  }
  
  return user || null;
};

export const updateUserLastActive = (userId: string): void => {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE users SET last_active = ? WHERE id = ?');
  stmt.run(Date.now(), userId);
};

// Batch job operations
export const createBatchJob = (
  userId: string,
  openaiJobId: string,
  chunkIds: string[],
  sourceMeta?: any
): BatchJob => {
  const db = getDatabase();
  const now = Date.now();
  const jobId = `batch_${now}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO batch_jobs (id, user_id, openai_job_id, status, created_at, updated_at, chunk_ids, source_meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    jobId,
    userId,
    openaiJobId,
    'validating',
    now,
    now,
    JSON.stringify(chunkIds),
    sourceMeta ? JSON.stringify(sourceMeta) : null
  );
  
  return {
    id: jobId,
    user_id: userId,
    openai_job_id: openaiJobId,
    status: 'validating',
    created_at: now,
    updated_at: now,
    chunk_ids: JSON.stringify(chunkIds),
    source_meta: sourceMeta ? JSON.stringify(sourceMeta) : undefined,
  };
};

export const getBatchJobsByUserId = (userId: string): BatchJob[] => {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM batch_jobs 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `);
  return stmt.all(userId) as BatchJob[];
};

export const getBatchJobByOpenaiId = (openaiJobId: string): BatchJob | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM batch_jobs WHERE openai_job_id = ?');
  const job = stmt.get(openaiJobId) as BatchJob | undefined;
  return job || null;
};

export const updateBatchJobStatus = (openaiJobId: string, status: string): boolean => {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE batch_jobs SET status = ?, updated_at = ? WHERE openai_job_id = ?');
  const result = stmt.run(status, Date.now(), openaiJobId);
  return result.changes > 0;
};

export const updateBatchUsage = (
  openaiJobId: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    details?: any;
  }
): boolean => {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE batch_jobs 
    SET 
      usage_input_tokens = COALESCE(?, usage_input_tokens),
      usage_output_tokens = COALESCE(?, usage_output_tokens),
      usage_total_tokens = COALESCE(?, usage_total_tokens),
      usage_details = COALESCE(?, usage_details),
      updated_at = ?
    WHERE openai_job_id = ?
  `);
  const result = stmt.run(
    usage.input_tokens ?? null,
    usage.output_tokens ?? null,
    usage.total_tokens ?? null,
    usage.details ? JSON.stringify(usage.details) : null,
    Date.now(),
    openaiJobId
  );
  return result.changes > 0;
};

export const deleteBatchJob = (openaiJobId: string, userId: string): boolean => {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM batch_jobs WHERE openai_job_id = ? AND user_id = ?');
  const result = stmt.run(openaiJobId, userId);
  return result.changes > 0;
};

// Translation history operations
export const createTranslationHistory = (
  userId: string,
  batchJobId: string | null,
  sourceLanguage: string,
  targetLanguage: string,
  translationMethod: string,
  characterCount: number
): TranslationHistory => {
  const db = getDatabase();
  const now = Date.now();
  const historyId = `history_${now}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO translation_history (id, user_id, batch_job_id, source_language, target_language, translation_method, character_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(historyId, userId, batchJobId, sourceLanguage, targetLanguage, translationMethod, characterCount, now);
  
  return {
    id: historyId,
    user_id: userId,
    batch_job_id: batchJobId || undefined,
    source_language: sourceLanguage,
    target_language: targetLanguage,
    translation_method: translationMethod,
    character_count: characterCount,
    created_at: now,
  };
};

export const getTranslationHistoryByUserId = (userId: string, limit: number = 50): TranslationHistory[] => {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM translation_history 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit) as TranslationHistory[];
};

// Cleanup operations
export const cleanupOldData = (daysOld: number = 30): void => {
  const db = getDatabase();
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  // Delete old batch jobs
  const batchStmt = db.prepare('DELETE FROM batch_jobs WHERE created_at < ?');
  const batchResult = batchStmt.run(cutoffTime);
  
  // Delete old translation history
  const historyStmt = db.prepare('DELETE FROM translation_history WHERE created_at < ?');
  const historyResult = historyStmt.run(cutoffTime);
  
  // Delete inactive users (no activity for 90 days)
  const userCutoffTime = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const userStmt = db.prepare('DELETE FROM users WHERE last_active < ?');
  const userResult = userStmt.run(userCutoffTime);
  
  console.log(`🧹 Cleanup completed: ${batchResult.changes} batch jobs, ${historyResult.changes} history records, ${userResult.changes} users removed`);
};

// Statistics
export const getDatabaseStats = () => {
  const db = getDatabase();
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const batchCount = db.prepare('SELECT COUNT(*) as count FROM batch_jobs').get() as { count: number };
  const historyCount = db.prepare('SELECT COUNT(*) as count FROM translation_history').get() as { count: number };
  
  const activeBatches = db.prepare(`
    SELECT COUNT(*) as count FROM batch_jobs 
    WHERE status IN ('validating', 'in_progress', 'finalizing')
  `).get() as { count: number };
  
  return {
    users: userCount.count,
    batchJobs: batchCount.count,
    translationHistory: historyCount.count,
    activeBatches: activeBatches.count,
  };
};

// Subtitle sources
export const upsertSubtitleSource = (
  userId: string,
  data: { filename?: string; file_type?: string; hash?: string; size_bytes?: number; line_count?: number; content?: string }
): { id: string } => {
  const db = getDatabase();
  const now = Date.now();
  const existing = data.hash ? db.prepare('SELECT id FROM subtitle_sources WHERE hash = ?').get(data.hash) as { id: string } | undefined : undefined;
  if (existing?.id) {
    return { id: existing.id };
  }
  const id = `source_${now}_${Math.random().toString(36).substr(2, 9)}`;
  db.prepare(`
    INSERT INTO subtitle_sources (id, user_id, filename, file_type, hash, size_bytes, line_count, created_at, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, data.filename || null, data.file_type || null, data.hash || null, data.size_bytes || null, data.line_count || null, now, data.content || null);
  return { id };
};

// Subtitle translations
export const upsertSubtitleTranslation = (
  sourceId: string,
  data: { batch_job_id?: string; target_language: string; content: string; status?: string }
): { id: string } => {
  const db = getDatabase();
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM subtitle_translations WHERE source_id = ? AND target_language = ?').get(sourceId, data.target_language) as { id: string } | undefined;
  if (existing?.id) {
    db.prepare(`
      UPDATE subtitle_translations SET content = ?, status = COALESCE(?, status), updated_at = ? WHERE id = ?
    `).run(data.content, data.status || null, now, existing.id);
    return { id: existing.id };
  }
  const id = `trans_${now}_${Math.random().toString(36).substr(2, 9)}`;
  db.prepare(`
    INSERT INTO subtitle_translations (id, source_id, batch_job_id, target_language, content, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sourceId, data.batch_job_id || null, data.target_language, data.content, data.status || 'final', now, now);
  return { id };
};

import { getDatabase, User, BatchJob, TranslationHistory, SubtitleSource, SubtitleSegment, SubtitleSegmentTranslation, SubtitleTranslation } from './database';
import { randomUUID } from 'crypto';

// User operations (authenticated users only)
export const createUser = (email: string, name: string, image: string, provider: string, providerId: string): User => {
  const db = getDatabase();
  const now = Date.now();
  const userId = `user_${now}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, image, provider, provider_id, created_at, last_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(userId, email, name, image, provider, providerId, now, now);
  
  return {
    id: userId,
    email,
    name,
    image,
    provider,
    provider_id: providerId,
    created_at: now,
    last_active: now,
  };
};

export const getUserByEmail = (email: string): User | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email) as User | undefined;
  
  if (user) {
    // Update last active time
    const updateStmt = db.prepare('UPDATE users SET last_active = ? WHERE id = ?');
    updateStmt.run(Date.now(), user.id);
  }
  
  return user || null;
};

export const getUserById = (userId: string): User | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(userId) as User | undefined;
  
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
  console.log("🔍 createBatchJob called with:", {
    userId,
    openaiJobId,
    chunkIdsLength: chunkIds.length,
    sourceMeta
  });
  
  const db = getDatabase();
  const now = Date.now();
  const jobId = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO batch_jobs (id, user_id, openai_job_id, status, created_at, updated_at, chunk_ids, source_meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  console.log("💾 Inserting batch job:", {
    jobId,
    userId,
    openaiJobId,
    status: 'validating',
    now,
    chunkIdsJson: JSON.stringify(chunkIds),
    sourceMetaJson: sourceMeta ? JSON.stringify(sourceMeta) : null
  });
  
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
    chunk_ids: chunkIds,
    source_meta: sourceMeta,
  };
};

export const getBatchJobsByUserId = (userId: string): BatchJob[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM batch_jobs WHERE user_id = ? ORDER BY created_at DESC');
  const jobs = stmt.all(userId) as any[];
  
  return jobs.map(job => ({
    ...job,
    chunk_ids: JSON.parse(job.chunk_ids),
    source_meta: job.source_meta ? JSON.parse(job.source_meta) : null,
  }));
};

export const getBatchJobById = (jobId: string): BatchJob | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM batch_jobs WHERE id = ?');
  const job = stmt.get(jobId) as any;
  
  if (!job) return null;
  
  return {
    ...job,
    chunk_ids: JSON.parse(job.chunk_ids),
    source_meta: job.source_meta ? JSON.parse(job.source_meta) : null,
  };
};

export const updateBatchJobStatus = (
  jobId: string,
  status: string,
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    details?: any;
  }
): void => {
  const db = getDatabase();
  const now = Date.now();
  
  const stmt = db.prepare(`
    UPDATE batch_jobs 
    SET status = ?, updated_at = ?, 
        usage_input_tokens = ?, usage_output_tokens = ?, 
        usage_total_tokens = ?, usage_details = ?
    WHERE id = ?
  `);
  
  stmt.run(
    status,
    now,
    usage?.inputTokens || null,
    usage?.outputTokens || null,
    usage?.totalTokens || null,
    usage?.details ? JSON.stringify(usage.details) : null,
    jobId
  );
};

export const updateBatchUsage = (
  jobId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    details?: any;
  }
): void => {
  const db = getDatabase();
  const now = Date.now();
  
  const stmt = db.prepare(`
    UPDATE batch_jobs 
    SET updated_at = ?, 
        usage_input_tokens = ?, usage_output_tokens = ?, 
        usage_total_tokens = ?, usage_details = ?
    WHERE id = ?
  `);
  
  stmt.run(
    now,
    usage.inputTokens,
    usage.outputTokens,
    usage.totalTokens || null,
    usage.details ? JSON.stringify(usage.details) : null,
    jobId
  );
};

export const deleteBatchJob = (jobId: string): void => {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM batch_jobs WHERE id = ?');
  stmt.run(jobId);
};

// Translation history operations
export const createTranslationHistory = (
  userId: string,
  sourceText: string,
  translatedText: string,
  translationMethod: string,
  service: string,
  targetLanguage: string,
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_estimate?: number;
    usage_details?: string;
  },
  batchJobId?: string
): TranslationHistory => {
  const db = getDatabase();
  const now = Date.now();
  const historyId = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO translation_history (
      id, user_id, batch_job_id, source_text, translated_text, 
      translation_method, service, target_language, character_count, 
      usage_input_tokens, usage_output_tokens, usage_total_tokens, 
      cost_estimate, usage_details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const characterCount = sourceText.length + translatedText.length;
  
  stmt.run(
    historyId,
    userId,
    batchJobId || null,
    sourceText,
    translatedText,
    translationMethod,
    service,
    targetLanguage,
    characterCount,
    usage?.input_tokens || null,
    usage?.output_tokens || null,
    usage?.total_tokens || null,
    usage?.cost_estimate || null,
    usage?.usage_details || null,
    now
  );
  
  return {
    id: historyId,
    user_id: userId,
    batch_job_id: batchJobId || null,
    source_text: sourceText,
    translated_text: translatedText,
    translation_method: translationMethod,
    service: service,
    target_language: targetLanguage,
    character_count: characterCount,
    usage_input_tokens: usage?.input_tokens || null,
    usage_output_tokens: usage?.output_tokens || null,
    usage_total_tokens: usage?.total_tokens || null,
    cost_estimate: usage?.cost_estimate || null,
    usage_details: usage?.usage_details || null,
    created_at: now,
  };
};

export const getTranslationHistoryByUserId = (userId: string): TranslationHistory[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM translation_history WHERE user_id = ? ORDER BY created_at DESC');
  const history = stmt.all(userId) as any[];
  
  return history.map(record => ({
    ...record,
    usage_details: record.usage_details ? JSON.parse(record.usage_details) : null,
  }));
};

// Subtitle source operations
export const createSubtitleSource = (
  userId: string,
  filename: string,
  fileType: string,
  hash: string,
  sizeBytes: number,
  lineCount: number,
  content: string
): SubtitleSource => {
  const db = getDatabase();
  const now = Date.now();
  const sourceId = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO subtitle_sources (id, user_id, filename, file_type, hash, size_bytes, line_count, created_at, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(sourceId, userId, filename, fileType, hash, sizeBytes, lineCount, now, content);
  
  return {
    id: sourceId,
    user_id: userId,
    filename,
    file_type: fileType,
    hash,
    size_bytes: sizeBytes,
    line_count: lineCount,
    created_at: now,
    content,
  };
};

export const getSubtitleSourceById = (sourceId: string): SubtitleSource | null => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subtitle_sources WHERE id = ?');
  const source = stmt.get(sourceId) as SubtitleSource | undefined;
  return source || null;
};

export const getSubtitleSourcesByUserId = (userId: string): SubtitleSource[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subtitle_sources WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId) as SubtitleSource[];
};

// Subtitle segment operations
export const createSubtitleSegments = (
  sourceIdOrBatchJobId: string,
  segments: Array<{
    segmentIndex: number;
    startTime: string | null;
    endTime: string | null;
    originalText: string;
  }>,
  isBatchJob: boolean = false
): SubtitleSegment[] => {
  const db = getDatabase();
  const now = Date.now();
  
  // 外部キー制約を一時的に無効化
  db.pragma('foreign_keys = OFF');
  
  const stmt = db.prepare(`
    INSERT INTO subtitle_segments (id, source_id, batch_job_id, segment_index, start_time, end_time, original_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const createdSegments: SubtitleSegment[] = [];
  
  for (const segment of segments) {
    const segmentId = randomUUID();
    
    // Debug logging
    console.log("🔍 Creating segment:", {
      segmentId,
      sourceId: isBatchJob ? null : sourceIdOrBatchJobId,
      batchJobId: isBatchJob ? sourceIdOrBatchJobId : null,
      segmentIndex: segment.segmentIndex,
      startTime: segment.startTime,
      endTime: segment.endTime,
      originalText: segment.originalText?.substring(0, 50) + '...',
      isBatchJob
    });
    
    try {
      stmt.run(
        segmentId,
        isBatchJob ? null : sourceIdOrBatchJobId, // source_id
        isBatchJob ? sourceIdOrBatchJobId : null, // batch_job_id
        segment.segmentIndex,
        segment.startTime,
        segment.endTime,
        segment.originalText,
        now
      );
      
      createdSegments.push({
        id: segmentId,
        source_id: isBatchJob ? null : sourceIdOrBatchJobId,
        batch_job_id: isBatchJob ? sourceIdOrBatchJobId : null,
        segment_index: segment.segmentIndex,
        start_time: segment.startTime,
        end_time: segment.endTime,
        original_text: segment.originalText,
        created_at: now,
      });
      
      console.log("✅ Segment created successfully:", segmentId);
    } catch (error) {
      console.error("❌ Error creating segment:", error);
      throw error;
    }
  }
  
  // 外部キー制約を再有効化
  db.pragma('foreign_keys = ON');
  
  return createdSegments;
};

export const getSubtitleSegments = (sourceId: string): SubtitleSegment[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subtitle_segments WHERE source_id = ? ORDER BY segment_index');
  return stmt.all(sourceId) as SubtitleSegment[];
};

// Subtitle segment translation operations
export const createSubtitleSegmentTranslations = (
  segmentId: string,
  batchJobId: string | null,
  targetLanguage: string,
  translatedText: string
): SubtitleSegmentTranslation => {
  const db = getDatabase();
  const now = Date.now();
  const translationId = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO subtitle_segment_translations (
      id, segment_id, batch_job_id, target_language, translated_text, 
      version, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    translationId,
    segmentId,
    batchJobId,
    targetLanguage,
    translatedText,
    1,
    'final',
    now,
    now
  );
  
  return {
    id: translationId,
    segment_id: segmentId,
    batch_job_id: batchJobId,
    target_language: targetLanguage,
    translated_text: translatedText,
    version: 1,
    status: 'final',
    created_at: now,
    updated_at: now,
  };
};

export const getSubtitleSegmentTranslations = (segmentId: string): SubtitleSegmentTranslation[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subtitle_segment_translations WHERE segment_id = ? ORDER BY version DESC');
  return stmt.all(segmentId) as SubtitleSegmentTranslation[];
};

// Subtitle translation operations (backward compatibility)
export const createSubtitleTranslation = (
  sourceId: string,
  batchJobId: string | null,
  targetLanguage: string,
  content: string
): SubtitleTranslation => {
  const db = getDatabase();
  const now = Date.now();
  const translationId = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO subtitle_translations (id, source_id, batch_job_id, target_language, content, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(translationId, sourceId, batchJobId, targetLanguage, content, 'final', now, now);
  
  return {
    id: translationId,
    source_id: sourceId,
    batch_job_id: batchJobId,
    target_language: targetLanguage,
    content,
    status: 'final',
    created_at: now,
    updated_at: now,
  };
};

export const getSubtitleTranslations = (sourceId: string): SubtitleTranslation[] => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subtitle_translations WHERE source_id = ? ORDER BY created_at DESC');
  return stmt.all(sourceId) as SubtitleTranslation[];
};

// Database statistics

export const markBatchJobAsCompleted = (jobId: string): void => {
  const db = getDatabase();
  const now = Date.now();
  const stmt = db.prepare('UPDATE batch_jobs SET is_completed = TRUE, completed_at = ?, updated_at = ? WHERE id = ?');
  stmt.run(now, now, jobId);
};

export const updateBatchJobUsage = (
  jobId: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  usageDetails: string
): void => {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE batch_jobs 
    SET usage_input_tokens = ?, usage_output_tokens = ?, usage_total_tokens = ?, usage_details = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(inputTokens, outputTokens, totalTokens, usageDetails, Date.now(), jobId);
};

export const createSubtitleSegmentTranslation = (
  userId: string,
  segmentId: string,
  translatedText: string,
  targetLanguage: string
): SubtitleSegmentTranslation => {
  const db = getDatabase();
  const now = Date.now();
  const id = `trans_${now}_${Math.random().toString(36).substr(2, 9)}`;
  
  const stmt = db.prepare(`
    INSERT INTO subtitle_segment_translations (id, user_id, segment_id, translated_text, target_language, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, segmentId, translatedText, targetLanguage, now);
  
  return {
    id,
    user_id: userId,
    segment_id: segmentId,
    translated_text: translatedText,
    target_language: targetLanguage,
    created_at: now,
  };
};

export const getDatabaseStats = () => {
  const db = getDatabase();
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const batchJobCount = db.prepare('SELECT COUNT(*) as count FROM batch_jobs').get() as { count: number };
  const translationHistoryCount = db.prepare('SELECT COUNT(*) as count FROM translation_history').get() as { count: number };
  const subtitleSourceCount = db.prepare('SELECT COUNT(*) as count FROM subtitle_sources').get() as { count: number };
  const subtitleSegmentCount = db.prepare('SELECT COUNT(*) as count FROM subtitle_segments').get() as { count: number };
  const subtitleSegmentTranslationCount = db.prepare('SELECT COUNT(*) as count FROM subtitle_segment_translations').get() as { count: number };
  const subtitleTranslationCount = db.prepare('SELECT COUNT(*) as count FROM subtitle_translations').get() as { count: number };
  
  return {
    users: userCount.count,
    batchJobs: batchJobCount.count,
    translationHistory: translationHistoryCount.count,
    subtitleSources: subtitleSourceCount.count,
    subtitleSegments: subtitleSegmentCount.count,
    subtitleSegmentTranslations: subtitleSegmentTranslationCount.count,
    subtitleTranslations: subtitleTranslationCount.count,
  };
};
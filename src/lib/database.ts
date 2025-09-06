import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_PATH = path.join(process.cwd(), 'data', 'subtitle-translator.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
let db: Database.Database;

export const getDatabase = (): Database.Database => {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Enable WAL mode for better performance
    db.pragma('foreign_keys = ON'); // Enable foreign key constraints
    
    // Initialize tables
    initializeTables();
  }
  return db;
};

// Type definitions
export interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  provider: string;
  provider_id: string;
  created_at: number;
  last_active: number;
}

export interface BatchJob {
  id: string;
  user_id: string;
  openai_job_id: string;
  status: string;
  created_at: number;
  updated_at: number;
  chunk_ids: string[];
  source_meta: any;
  is_completed: boolean;
  completed_at?: number;
  usage_input_tokens?: number;
  usage_output_tokens?: number;
  usage_total_tokens?: number;
  usage_details?: any;
}

export interface TranslationHistory {
  id: string;
  user_id: string;
  batch_job_id: string | null;
  source_text: string;
  translated_text: string;
  translation_method: string;
  service: string;
  target_language: string;
  character_count: number;
  usage_input_tokens?: number;
  usage_output_tokens?: number;
  usage_total_tokens?: number;
  cost_estimate?: number;
  usage_details?: any;
  created_at: number;
}

export interface SubtitleSource {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  hash: string;
  size_bytes: number;
  line_count: number;
  created_at: number;
  content: string;
}

export interface SubtitleSegment {
  id: string;
  source_id: string | null;
  batch_job_id: string | null;
  segment_index: number;
  start_time: string | null;
  end_time: string | null;
  original_text: string;
  created_at: number;
}

export interface SubtitleSegmentTranslation {
  id: string;
  segment_id: string;
  batch_job_id: string | null;
  target_language: string;
  translated_text: string;
  version: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface SubtitleTranslation {
  id: string;
  source_id: string;
  batch_job_id: string | null;
  target_language: string;
  content: string;
  status: string;
  created_at: number;
  updated_at: number;
}

// Database schema
const initializeTables = () => {
  const database = getDatabase();
  
  // Users table (authenticated users only)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      image TEXT,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL
    )
  `);

  // Batch jobs table
  database.exec(`
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      openai_job_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'validating',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      chunk_ids TEXT NOT NULL, -- JSON array of chunk IDs
      source_meta TEXT, -- JSON object with source file metadata
      is_completed BOOLEAN DEFAULT FALSE, -- Completion flag
      completed_at INTEGER, -- Completion timestamp
      usage_input_tokens INTEGER, -- Batch input tokens total (responses API)
      usage_output_tokens INTEGER, -- Batch output tokens total (responses API)
      usage_total_tokens INTEGER, -- Total tokens (if available)
      usage_details TEXT, -- JSON of per-item or raw usage aggregation
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Backfill columns if upgrading from older schema
  const existingCols = database.prepare(`PRAGMA table_info(batch_jobs)`).all() as Array<{name: string}>;
  const colNames = new Set(existingCols.map(c => c.name));
  const alter = (sql: string) => { try { database.exec(sql); } catch { /* noop when column exists */ } };
  if (!colNames.has('is_completed')) alter(`ALTER TABLE batch_jobs ADD COLUMN is_completed BOOLEAN DEFAULT FALSE`);
  if (!colNames.has('completed_at')) alter(`ALTER TABLE batch_jobs ADD COLUMN completed_at INTEGER`);
  if (!colNames.has('usage_input_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_input_tokens INTEGER`);
  if (!colNames.has('usage_output_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_output_tokens INTEGER`);
  if (!colNames.has('usage_total_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_total_tokens INTEGER`);
  if (!colNames.has('usage_details')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_details TEXT`);

  // Migrate users table to authenticated-only schema
  const userCols = database.prepare(`PRAGMA table_info(users)`).all() as Array<{name: string}>;
  const userColNames = new Set(userCols.map(c => c.name));
  
  // Add OAuth columns if they don't exist
  if (!userColNames.has('email')) alter(`ALTER TABLE users ADD COLUMN email TEXT UNIQUE`);
  if (!userColNames.has('name')) alter(`ALTER TABLE users ADD COLUMN name TEXT`);
  if (!userColNames.has('image')) alter(`ALTER TABLE users ADD COLUMN image TEXT`);
  if (!userColNames.has('provider')) alter(`ALTER TABLE users ADD COLUMN provider TEXT`);
  if (!userColNames.has('provider_id')) alter(`ALTER TABLE users ADD COLUMN provider_id TEXT`);
  
  // Clean up anonymous users and deprecated columns
  try {
    // Delete anonymous users (users without email)
    const deletedAnonymous = database.prepare(`DELETE FROM users WHERE email IS NULL OR email = ''`).run();
    if (deletedAnonymous.changes > 0) {
      console.log(`🗑️ Deleted ${deletedAnonymous.changes} anonymous users`);
    }
    
    // Drop deprecated columns (SQLite doesn't support DROP COLUMN, so we'll recreate the table)
    const hasDeprecatedCols = userColNames.has('session_id') || userColNames.has('user_agent') || userColNames.has('ip_address');
    if (hasDeprecatedCols) {
      console.log('🔄 Migrating users table to authenticated-only schema...');
      
      // Create new table with clean schema
      database.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          image TEXT,
          provider TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_active INTEGER NOT NULL
        )
      `);
      
      // Copy authenticated users to new table
      const copiedUsers = database.prepare(`
        INSERT INTO users_new (id, email, name, image, provider, provider_id, created_at, last_active)
        SELECT id, email, name, image, provider, provider_id, created_at, last_active
        FROM users
        WHERE email IS NOT NULL AND email != ''
      `).run();
      
      // Drop old table and rename new one
      database.exec(`DROP TABLE users`);
      database.exec(`ALTER TABLE users_new RENAME TO users`);
      
      console.log(`✅ Users table migrated to authenticated-only schema (${copiedUsers.changes} users migrated)`);
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Backfill translation_history columns
  const histCols = database.prepare(`PRAGMA table_info(translation_history)`).all() as Array<{name: string}>;
  const hnames = new Set(histCols.map(c => c.name));
  if (!hnames.has('source_text')) alter(`ALTER TABLE translation_history ADD COLUMN source_text TEXT`);
  if (!hnames.has('translated_text')) alter(`ALTER TABLE translation_history ADD COLUMN translated_text TEXT`);
  if (!hnames.has('service')) alter(`ALTER TABLE translation_history ADD COLUMN service TEXT`);
  if (!hnames.has('usage_input_tokens')) alter(`ALTER TABLE translation_history ADD COLUMN usage_input_tokens INTEGER`);
  if (!hnames.has('usage_output_tokens')) alter(`ALTER TABLE translation_history ADD COLUMN usage_output_tokens INTEGER`);
  if (!hnames.has('usage_total_tokens')) alter(`ALTER TABLE translation_history ADD COLUMN usage_total_tokens INTEGER`);
  if (!hnames.has('cost_estimate')) alter(`ALTER TABLE translation_history ADD COLUMN cost_estimate REAL`);
  if (!hnames.has('usage_details')) alter(`ALTER TABLE translation_history ADD COLUMN usage_details TEXT`);

  // Translation history table (optional, for analytics)
  database.exec(`
    CREATE TABLE IF NOT EXISTS translation_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      batch_job_id TEXT,
      source_text TEXT,
      translated_text TEXT,
      translation_method TEXT,
      service TEXT,
      target_language TEXT,
      character_count INTEGER,
      usage_input_tokens INTEGER,
      usage_output_tokens INTEGER,
      usage_total_tokens INTEGER,
      cost_estimate REAL,
      usage_details TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (batch_job_id) REFERENCES batch_jobs (id) ON DELETE SET NULL
    )
  `);

  // Subtitle source originals (optional text storage)
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT,
      file_type TEXT,
      hash TEXT UNIQUE,
      size_bytes INTEGER,
      line_count INTEGER,
      created_at INTEGER NOT NULL,
      content TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Subtitle segments (individual subtitle entries with timestamps)
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_segments (
      id TEXT PRIMARY KEY,
      source_id TEXT, -- Optional: for normal translations
      batch_job_id TEXT, -- Optional: for batch translations
      segment_index INTEGER NOT NULL,
      start_time TEXT, -- Format: "00:00:01.000" or "00:00:01,000" (nullable for batch jobs)
      end_time TEXT,   -- Format: "00:00:03.500" or "00:00:03,500" (nullable for batch jobs)
      original_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_id) REFERENCES subtitle_sources (id) ON DELETE CASCADE,
      FOREIGN KEY (batch_job_id) REFERENCES batch_jobs (id) ON DELETE CASCADE,
      CHECK ((source_id IS NOT NULL AND batch_job_id IS NULL) OR (source_id IS NULL AND batch_job_id IS NOT NULL))
    )
  `);

  // Subtitle segment translations (translated text for each segment)
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_segment_translations (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL,
      batch_job_id TEXT,
      target_language TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'final',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (segment_id) REFERENCES subtitle_segments (id) ON DELETE CASCADE,
      FOREIGN KEY (batch_job_id) REFERENCES batch_jobs (id) ON DELETE SET NULL
    )
  `);

  // Subtitle translations (full merged text per language) - kept for backward compatibility
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_translations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      batch_job_id TEXT,
      target_language TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'final',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (source_id) REFERENCES subtitle_sources (id) ON DELETE CASCADE,
      FOREIGN KEY (batch_job_id) REFERENCES batch_jobs (id) ON DELETE SET NULL
    )
  `);

  // Create indexes for better performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_jobs (user_id);
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs (status);
    CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs (created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_translation_history_user_id ON translation_history (user_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_sources_user_id ON subtitle_sources (user_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_segments_source_id ON subtitle_segments (source_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_segments_timing ON subtitle_segments (start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_subtitle_segment_translations_segment_id ON subtitle_segment_translations (segment_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_segment_translations_language ON subtitle_segment_translations (target_language);
    CREATE INDEX IF NOT EXISTS idx_subtitle_translations_source_id ON subtitle_translations (source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_subtitle_translation_latest ON subtitle_translations (source_id, target_language);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_segment_translation_latest ON subtitle_segment_translations (segment_id, target_language, version);
  `);

  console.log('✅ Database tables initialized successfully');
};

export default getDatabase;
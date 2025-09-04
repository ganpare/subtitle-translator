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

// Database schema
const initializeTables = () => {
  const database = getDatabase();
  
  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      user_agent TEXT,
      ip_address TEXT
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
  if (!colNames.has('usage_input_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_input_tokens INTEGER`);
  if (!colNames.has('usage_output_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_output_tokens INTEGER`);
  if (!colNames.has('usage_total_tokens')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_total_tokens INTEGER`);
  if (!colNames.has('usage_details')) alter(`ALTER TABLE batch_jobs ADD COLUMN usage_details TEXT`);

  // Backfill translation_history columns
  const histCols = database.prepare(`PRAGMA table_info(translation_history)`).all() as Array<{name: string}>;
  const hnames = new Set(histCols.map(c => c.name));
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
      source_language TEXT,
      target_language TEXT,
      translation_method TEXT,
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

  // Subtitle translations (full merged text per language)
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
    CREATE INDEX IF NOT EXISTS idx_users_session_id ON users (session_id);
    CREATE INDEX IF NOT EXISTS idx_translation_history_user_id ON translation_history (user_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_sources_user_id ON subtitle_sources (user_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_translations_source_id ON subtitle_translations (source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_subtitle_translation_latest ON subtitle_translations (source_id, target_language);
  `);

  console.log('✅ Database tables initialized successfully');
};

// Cleanup function
export const closeDatabase = () => {
  if (db) {
    db.close();
    db = null as any;
  }
};

// Database types
export interface User {
  id: string;
  session_id: string;
  created_at: number;
  last_active: number;
  user_agent?: string;
  ip_address?: string;
}

export interface BatchJob {
  id: string;
  user_id: string;
  openai_job_id: string;
  status: string;
  created_at: number;
  updated_at: number;
  chunk_ids: string; // JSON string
  source_meta?: string; // JSON string
  usage_input_tokens?: number;
  usage_output_tokens?: number;
  usage_total_tokens?: number;
  usage_details?: string;
}

export interface TranslationHistory {
  id: string;
  user_id: string;
  batch_job_id?: string;
  source_language: string;
  target_language: string;
  translation_method: string;
  character_count: number;
  created_at: number;
}

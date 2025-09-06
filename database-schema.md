# データベーススキーマ ER図

## 現在のテーブル構成（7テーブル）

```mermaid
erDiagram
    users {
        TEXT id PK "ユーザーID"
        TEXT session_id UK "セッションID"
        INTEGER created_at "作成日時"
        INTEGER last_active "最終アクティブ日時"
        TEXT user_agent "ユーザーエージェント"
        TEXT ip_address "IPアドレス"
    }

    batch_jobs {
        TEXT id PK "バッチジョブID"
        TEXT user_id FK "ユーザーID"
        TEXT openai_job_id UK "OpenAIジョブID"
        TEXT status "ステータス"
        INTEGER created_at "作成日時"
        INTEGER updated_at "更新日時"
        TEXT chunk_ids "チャンクID配列(JSON)"
        TEXT source_meta "ソースメタデータ(JSON)"
        INTEGER usage_input_tokens "入力トークン数"
        INTEGER usage_output_tokens "出力トークン数"
        INTEGER usage_total_tokens "総トークン数"
        TEXT usage_details "使用量詳細(JSON)"
    }

    translation_history {
        TEXT id PK "翻訳履歴ID"
        TEXT user_id FK "ユーザーID"
        TEXT batch_job_id FK "バッチジョブID"
        TEXT source_language "ソース言語"
        TEXT target_language "ターゲット言語"
        TEXT translation_method "翻訳方法"
        INTEGER character_count "文字数"
        INTEGER created_at "作成日時"
        INTEGER usage_input_tokens "入力トークン数"
        INTEGER usage_output_tokens "出力トークン数"
        INTEGER usage_total_tokens "総トークン数"
        REAL cost_estimate "コスト見積もり"
        TEXT usage_details "使用量詳細(JSON)"
    }

    subtitle_sources {
        TEXT id PK "ソースID"
        TEXT user_id FK "ユーザーID"
        TEXT filename "ファイル名"
        TEXT file_type "ファイル形式"
        TEXT hash UK "ハッシュ値"
        INTEGER size_bytes "ファイルサイズ"
        INTEGER line_count "行数"
        INTEGER created_at "作成日時"
        TEXT content "ファイル内容"
    }

    subtitle_segments {
        TEXT id PK "セグメントID"
        TEXT source_id FK "ソースID"
        INTEGER segment_index "セグメント番号"
        TEXT start_time "開始時間"
        TEXT end_time "終了時間"
        TEXT original_text "原文テキスト"
        INTEGER created_at "作成日時"
    }

    subtitle_segment_translations {
        TEXT id PK "翻訳ID"
        TEXT segment_id FK "セグメントID"
        TEXT batch_job_id FK "バッチジョブID"
        TEXT target_language "ターゲット言語"
        TEXT translated_text "翻訳テキスト"
        INTEGER version "バージョン"
        TEXT status "ステータス"
        INTEGER created_at "作成日時"
        INTEGER updated_at "更新日時"
    }

    subtitle_translations {
        TEXT id PK "翻訳ID"
        TEXT source_id FK "ソースID"
        TEXT batch_job_id FK "バッチジョブID"
        TEXT target_language "ターゲット言語"
        TEXT content "翻訳内容"
        TEXT status "ステータス"
        INTEGER created_at "作成日時"
        INTEGER updated_at "更新日時"
    }

    %% リレーションシップ
    users ||--o{ batch_jobs : "作成"
    users ||--o{ translation_history : "実行"
    users ||--o{ subtitle_sources : "アップロード"
    
    batch_jobs ||--o{ translation_history : "含む"
    batch_jobs ||--o{ subtitle_segment_translations : "生成"
    batch_jobs ||--o{ subtitle_translations : "生成"
    
    subtitle_sources ||--o{ subtitle_segments : "分割"
    subtitle_sources ||--o{ subtitle_translations : "翻訳"
    
    subtitle_segments ||--o{ subtitle_segment_translations : "翻訳"
```

## テーブル詳細

### 1. **users** - ユーザー管理
- セッション管理とユーザー追跡
- プライバシー保護のためのIPアドレス記録

### 2. **batch_jobs** - バッチ翻訳ジョブ
- OpenAI Batch APIのジョブ管理
- トークン使用量とコスト追跡
- ソースファイルのメタデータ保存

### 3. **translation_history** - 翻訳履歴
- 翻訳実行の記録と分析
- コスト計算と使用量追跡

### 4. **subtitle_sources** - 字幕ソースファイル
- アップロードされた字幕ファイルの全体保存
- ファイル形式、サイズ、ハッシュ値の管理

### 5. **subtitle_segments** - 字幕セグメント ✨
- 個別の字幕エントリ（タイムスタンプ + テキスト）
- メディアプレイヤーでの時間軸表示に最適化

### 6. **subtitle_segment_translations** - セグメント翻訳 ✨
- セグメント単位の多言語翻訳
- バージョン管理で翻訳履歴を追跡

### 7. **subtitle_translations** - 翻訳結果（全文）
- 後方互換性のための全文翻訳保存
- 既存機能との互換性維持

## インデックス

- `idx_batch_jobs_user_id` - ユーザー別バッチジョブ検索
- `idx_batch_jobs_status` - ステータス別検索
- `idx_subtitle_segments_timing` - 時間範囲検索
- `idx_subtitle_segment_translations_language` - 言語別翻訳検索
- `uniq_segment_translation_latest` - 最新翻訳の一意性保証

## アプリサーバーでの利用例

```typescript
// 特定時間の字幕を取得
const segments = await db.query(`
  SELECT s.*, st.translated_text 
  FROM subtitle_segments s
  LEFT JOIN subtitle_segment_translations st 
    ON s.id = st.segment_id 
    AND st.target_language = 'ja'
  WHERE s.source_id = ? 
    AND s.start_time <= ? 
    AND s.end_time >= ?
  ORDER BY s.segment_index
`, [sourceId, currentTime, currentTime]);
```

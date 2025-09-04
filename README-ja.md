# 字幕翻訳ツール（Fork 版）

このリポジトリは元プロジェクト（クライアント主体）のフォークで、サーバー支援のバッチ対応とDB永続化を追加しています。

## このフォークで追加したこと
- サーバー支援の OpenAI Batch API
  - クライアントが OpenAI にバッチ（JSONL）を作成し、返ってきた `jobId` をサーバーDBへ保存
  - サーバーのステータス確認API（`/api/batch/status`）が OpenAI を代理照会（APIキーはサーバー `.env`）
  - UI の「API 設定 → OpenAI」タブ下に「OpenAI Batch Jobs」パネル（一覧はサーバーDBから）
- ローカルストレージではなく DB 永続化
  - ジョブ/ステータス/ソースメタ（ファイル名・ハッシュ・形式・行数）/使用量（usage）を SQLite に保存
  - 任意で原文全文・翻訳全文も保存し、後から再配信（例: メディアプレイヤー）に活用可能
- 定期監視（ポーリング）
  - クライアントは30秒ごとに一覧更新＋行ごとの Refresh
  - サーバールートをスケジューラから呼べば、ブラウザを閉じても更新可能
- GPT‑5 / o5 系 responses エンドポイント対応
  - GPT‑5/o5 は `/v1/responses`、従来モデルは `/v1/chat/completions` に自動切替
- 安全な鍵管理
  - サーバー `.env` (`OPENAI_API_KEY`) を参照し、クライアントに鍵を渡さない

## メリット
- ブラウザを閉じても追跡できる（サーバーが監視）
- 複数端末で同じジョブ一覧（DB）
- 使用トークン量を履歴に保存し、課金/分析に活用
- 原文・翻訳の全文をDB化し、外部サービスへ再利用しやすい

## 環境変数
```
NEXT_PUBLIC_ENABLE_BATCH=true   # UIのバッチパネル表示
ENABLE_SERVER_BATCH=true        # サーバー側のステータス確認
OPENAI_API_KEY=sk-...           # サーバー側の OpenAI キー
```

## 主要コード
- UI: `src/app/components/openai-batch/BatchStatusPanel.tsx`
- バッチ: `src/app/components/openai-batch/batchAPI.ts`
- サーバーAPI: `src/app/api/batch/*`, `src/app/api/subtitles/*`
- DB: `src/lib/database.ts`, `src/lib/db-operations.ts`

## 起動方法

### Docker（推奨）
```bash
# Docker Compose を使用
docker-compose up -d

# または Docker 直接実行
docker build -t subtitle-translator .
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_openai_api_key_here \
  --name subtitle-translator \
  subtitle-translator
```

**Docker環境変数:**
- `OPENAI_API_KEY`: OpenAI APIキー（バッチ機能に必要）
- `NEXT_PUBLIC_ENABLE_BATCH`: バッチモード有効化（デフォルト: true）
- `ENABLE_SERVER_BATCH`: サーバー側バッチ監視（デフォルト: true）

### ローカル開発
```bash
yarn
yarn dev
# http://localhost:3000
```

> 元README（英語）の機能詳細は `README.md` を参照してください。

# 字幕翻訳ツール（Fork 版）

このリポジトリは元プロジェクト（クライアント主体）のフォークで、サーバー支援のバッチ対応とDB永続化を追加しています。

## このフォークで追加したこと
- サーバー支援の OpenAI Batch API
  - クライアントが OpenAI にバッチ（JSONL）を作成し、返ってきた `jobId` をサーバーDBへ保存
  - サーバーのステータス確認API（`/api/batch/status`）が OpenAI を代理照会（APIキーはサーバー `.env`）
  - UI の「API 設定 → OpenAI」タブ下に「OpenAI Batch Jobs」パネル（一覧はサーバーDBから）
- Google OAuth 認証
  - バッチ翻訳機能には Google サインインが必要（マルチデバイスアクセス・サーバー側ジョブ追跡）
  - 基本翻訳（単一ファイル）は匿名のままクライアント側のみで動作
  - ユーザーデータは SQLite に適切なセッション管理で保存
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
# バッチ翻訳機能
NEXT_PUBLIC_ENABLE_BATCH=true   # UIのバッチパネル表示
ENABLE_SERVER_BATCH=true        # サーバー側のステータス確認
OPENAI_API_KEY=sk-...           # サーバー側の OpenAI キー

# Google OAuth 認証（バッチ機能に必要）
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
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

### Google OAuth 認証設定

バッチ翻訳機能を使用するには、Google OAuth 認証が必要です。以下の手順に従って設定してください：

#### 1. Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存のプロジェクトを選択
3. **APIs & Services** > **Credentials** に移動
4. **Create Credentials** > **OAuth client ID** を選択
5. **Application type**: Web application を選択
6. **Authorized redirect URIs** に追加:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
7. **Client ID** と **Client Secret** をコピー

#### 2. 環境変数設定

プロジェクトルートに `.env.local` と `.env` ファイルを作成：

```bash
# NextAuth.js 設定
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth 設定
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here

# OpenAI API 設定（オプション）
OPENAI_API_KEY=your-openai-api-key-here
```

#### 3. NEXTAUTH_SECRET 生成

**方法1: Node.js を使用（推奨）**
```bash
# 一時ファイルを作成
echo "console.log(require('crypto').randomBytes(32).toString('hex'));" > temp.js
node temp.js
del temp.js  # Windows
rm temp.js  # Linux/Mac
```

**方法2: OpenSSL を使用**
```bash
openssl rand -hex 32
```

**方法3: オンラインツール**
- https://generate-secret.vercel.app/32 にアクセス
- 32文字のランダム文字列を生成

#### 4. アプリケーション再起動

環境変数設定後、アプリケーションを再起動：

```bash
# Docker の場合
docker-compose down
docker-compose up -d

# ローカル開発の場合
yarn dev
```

#### 5. 認証確認

1. http://localhost:3000 を開く
2. **API 設定** → **OpenAI** に移動
3. **バッチモード** を有効化
4. **Google でサインイン** をクリック
5. OAuth フローを完了
6. **バッチステータスパネル** が表示されることを確認

### トラブルシューティング

#### よくある問題

**1. Google OAuth サインインが動作しない**
- **エラー**: `client_id is required`
- **解決策**: `.env.local` で `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が正しく設定されているか確認
- **確認**: Google Cloud Console のリダイレクト URI が `http://localhost:3000/api/auth/callback/google` と一致しているか確認

**2. NEXTAUTH_SECRET 生成の問題**
- **エラー**: PowerShell で `node -e` コマンドが失敗
- **解決策**: 一時ファイル方式を使用:
  ```bash
  echo "console.log(require('crypto').randomBytes(32).toString('hex'));" > temp.js
  node temp.js
  del temp.js
  ```

**3. データベースが更新されない**
- **エラー**: ホスト OS のデータベースがコンテナの変更を反映しない
- **解決策**: 
  ```bash
  docker-compose down
  del data\subtitle-translator.db  # Windows
  rm data/subtitle-translator.db   # Linux/Mac
  docker-compose up -d
  ```

**4. ハイドレーションエラー**
- **エラー**: `Hydration failed because the initial UI does not match what was rendered on the server`
- **解決策**: ブラウザキャッシュをクリア（強制更新: Ctrl+Shift+R）またはシークレットモードを試す

**5. バッチ翻訳が表示されない**
- **エラー**: UI にバッチモードが表示されない
- **解決策**: `NEXT_PUBLIC_ENABLE_BATCH=true` と `ENABLE_SERVER_BATCH=true` が設定されているか確認

#### 環境変数リファレンス

| 変数名 | 必須 | 説明 | デフォルト |
|--------|------|------|-----------|
| `NEXTAUTH_URL` | はい | アプリケーションURL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | はい | JWT署名シークレット | 生成 |
| `GOOGLE_CLIENT_ID` | はい* | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | はい* | Google OAuth Client Secret | - |
| `OPENAI_API_KEY` | いいえ | バッチモード用OpenAI APIキー | - |
| `NEXT_PUBLIC_ENABLE_BATCH` | いいえ | バッチUI有効化 | `true` |
| `ENABLE_SERVER_BATCH` | いいえ | サーバー側バッチ有効化 | `true` |

*バッチ翻訳機能にのみ必要

### ローカル開発
```bash
yarn
yarn dev
# http://localhost:3000
```

> 元README（英語）の機能詳細は `README.md` を参照してください。

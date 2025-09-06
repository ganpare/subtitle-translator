<h1 align="center">
⚡️Subtitle Translator
</h1>
<p align="center">
    English | <a href="./README-zh.md">中文</a> | <a href="./README-ja.md">日本語</a>
    
</p>
<p align="center">
    <em>Translate subtitles effortlessly—fast, accurate, and multilingual!</em>
</p>

**Subtitle Translator** is a **free and open-source** subtitle translation tool that supports `.srt`, `.ass`, `.vtt`, and `.lrc` formats. You can upload subtitle files or paste content directly, select your target language, and complete translation with a single click. The tool supports both **single-file translation** and **batch processing** for multiple files simultaneously. 

> **🔐 Authentication & Privacy**: For basic translation, all data stays in your browser. For advanced batch features, Google OAuth authentication is required to enable server-side job tracking and multi-device access. See [Google OAuth Setup](#google-oauth-authentication-setup) for configuration details.  

Compared to traditional subtitle translation tools, Subtitle Translator excels with its **batch processing, high-speed translation, translation caching, and automatic format adaptation**, significantly improving workflow efficiency. It is ideal for use in film and TV, education, and content creation.  

👉 **Try it online**: <https://tools.newzone.top/en/subtitle-translator>  

## Key Features

!["Batch Translation"](https://img.newzone.top/subtile-translator.gif?imageMogr2/format/webp "Batch Translation")  

- **Real-time translation**: Uses **chunked compression** and **parallel processing** to achieve **1-second translation per episode** (GTX interface is slightly slower).  
- **Batch processing**: Handles **hundreds of subtitle files at once**, significantly boosting efficiency.  
- **Translation caching**: Automatically **stores translation results locally**, avoiding redundant API calls and saving both time and costs.  
- **Format compatibility**: **Automatically detects and adapts** to `.srt`, `.ass`, and `.vtt` subtitle formats, preserving the original file name.  
- **Subtitle extraction**: Allows **easy text extraction** for use in AI summarization, content repurposing, and more.  
- **Multiple translation options**: Supports **3 free translation APIs, 3 commercial-grade APIs, and 5 AI LLM (large language model) interfaces**, catering to different needs.  
- **Multi-language support & internationalization**: Translates subtitles into **35 major languages**, including English, Chinese, Japanese, Korean, French, German, and Spanish. It also supports **multi-language translations from a single file**, generating **bilingual or multilingual subtitles**.  

Subtitle Translator offers a range of customizable parameters to meet diverse user needs. Below is a detailed explanation of its features.  

---

## This repository (fork) – Added features and architecture

This project is a fork that adds server‑assisted OpenAI Batch API support and database‑backed job tracking while staying compatible with the original client‑only design.

### What's new in this fork
- Server‑assisted Batch translation (OpenAI)
  - Client creates OpenAI Batch jobs (JSONL) and immediately persists the `jobId` on the server.
  - Server checks job status via a route (`/api/batch/status`) using server‑side API keys (no keys in the browser).
  - UI shows an "OpenAI Batch Jobs" panel in API Settings → OpenAI; jobs list is loaded from the server DB.
- Google OAuth Authentication
  - Batch translation features require Google sign-in for multi-device access and server-side job tracking.
  - Basic translation (single file) remains anonymous and client-side only.
  - User data is stored in SQLite with proper session management.
- Database persistence instead of local storage
  - Jobs, status, basic source metadata (filename, hash, format, line count) and usage metrics are stored in SQLite by default.
  - Optional: Save original subtitle content and merged translated content for later reuse (e.g., media player server).
- Periodic monitoring (polling) options
  - Client auto‑refreshes the jobs list every 30s, and each job has a manual Refresh.
  - Server route can be called by a scheduler (e.g., cron) to update statuses even when the browser is closed.
- GPT‑5/o5 responses endpoint support
  - JSONL is generated for `/v1/responses` automatically for GPT‑5/o5 models; legacy models use `/v1/chat/completions`.
- Safer key handling
  - Server routes read `OPENAI_API_KEY` from `.env` and never require keys from the client.

### Why this matters
- Close the browser safely: jobs are tracked on the server and can complete without the page being open.
- Multi‑device visibility: your jobs list comes from the DB, not from per‑browser local storage.
- Easier operations: optional cron can keep statuses fresh; usage (token) metrics are recorded for analysis/billing.

### Environment flags
```
# Batch Translation Features
NEXT_PUBLIC_ENABLE_BATCH=true   # Show Batch panel in UI
ENABLE_SERVER_BATCH=true        # Enable server status checks
OPENAI_API_KEY=sk-...           # Server-side OpenAI key

# Google OAuth Authentication (Required for batch features)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

### Where to look in code
- UI: `src/app/components/openai-batch/BatchStatusPanel.tsx`
- Batch utilities: `src/app/components/openai-batch/batchAPI.ts`
- Server routes: `src/app/api/batch/*`, `src/app/api/subtitles/*`
- DB: `src/lib/database.ts`, `src/lib/db-operations.ts`

---

## Translation APIs  

Subtitle Translator supports **5 translation APIs** and **5 AI LLM models**, allowing users to choose the best option for their needs.  

### API Comparison

| API | Translation Quality | Stability | Best Use Case | Free Tier |  
|-|-|-|-|-|  
| **DeepL (X)** | ★★★★★ | ★★★★☆ | Best for long texts, fluent translations | 500,000 characters/month |  
| **Google Translate** | ★★★★☆ | ★★★★★ | Best for UI text and common phrases | 500,000 characters/month |  
| **Azure Translate** | ★★★★☆ | ★★★★★ | Best for multi-language support | **2 million characters/month** (first 12 months) |  
| **GTX API (Free)** | ★★★☆☆ | ★★★☆☆ | General translation tasks | Free |  
| **GTX Web (Free)** | ★★★☆☆ | ★★☆☆☆ | Small-scale translations | Free |  

- **DeepL**: Ideal for long-form content, offering **more fluent** translations, but requires local or server proxy usage.  
- **Google Translate**: **Stable and widely used**, best for **short sentences and UI text**.  
- **Azure Translate**: **Supports the most languages**, making it the best option for **multi-language translations**.  
- **GTX API/Web**: Free translation options, suitable for **light usage** but with **limited stability**.  

🔹 **API Key Registration**: [Google Translate](https://cloud.google.com/translate/docs/setup?hl=zh-cn), [Azure Translate](https://learn.microsoft.com/zh-cn/azure/ai-services/translator/reference/v3-0-translate), [DeepL Translate](https://www.deepl.com/your-account/keys)  

🔹 **Supported Languages**: [DeepL](https://developers.deepl.com/docs/v/zh/api-reference/languages), [Google Translate](https://cloud.google.com/translate/docs/languages?hl=zh-cn), [Azure](https://learn.microsoft.com/zh-cn/azure/ai-services/translator/language-support)  

### LLM Translation (AI Models)  

Subtitle Translator also supports **5 AI LLM models**, including **OpenAI, DeepSeek, Siliconflow, and Groq**.  

- **Best for**: **Literary works, technical documents, and multilingual dialogue**.  
- **Customization**: Supports **system prompts and user prompts**, allowing personalized translation styles.  
- **Temperature control**: Adjusts **AI translation creativity**, where **higher values produce more diverse translations** but may reduce consistency.  

## Subtitle Format Support

Subtitle Translator supports **`.srt`, `.ass`, and `.vtt` formats** with **automatic format detection and adaptation**:  

- **Bilingual subtitles**: Translated text **can be inserted below the original** and its position can be adjusted.  
- **Timeline compatibility**: Supports **over 100-hour timestamps**, along with **1-3 digit millisecond formats** to ensure seamless synchronization.  
- **Automatic encoding detection**: Prevents **character encoding issues** by detecting and adjusting encoding settings automatically.  

## Translation Modes  

Subtitle Translator offers **batch translation** and **single-file translation**, adapting to different workflows:  

✅ **Batch Translation (Default Mode)**  

- **Processes hundreds of files simultaneously**, maximizing efficiency.  
- **Translated files are automatically saved** in the browser’s default download folder.  

✅ **Single-File Mode** (For quick tasks)  

- **Allows direct text input and translation**.  
- **Results are displayed instantly**, with the option to **copy or export**.  
- Uploading a new file **will replace the previous file**.  

## Translation Caching

Subtitle Translator **employs local caching** to optimize efficiency:  

- **Caching rules**: Translation results are stored using a unique key format:  
  `original_text_target_language_source_language_API_model_settings`  
- **Efficiency boost**: **Avoids redundant translations, reducing API calls and speeding up workflows**.  

## Multi-Language Translation  

Subtitle Translator allows **translating the same subtitle file into multiple languages at once**, ideal for internationalization.  

For example:  

- Translate an **English subtitle** into **Chinese, Japanese, German, and French** simultaneously for global accessibility.  
- Supports **35 major languages**, with more to be added based on user feedback.  

## Usage Notes  

When using Subtitle Translator, keep in mind:  

- **DeepL API does not support web-based usage**. Instead, Subtitle Translator **provides a dedicated server-side proxy** for DeepL translations, ensuring security and efficiency. Users can also **deploy the proxy locally**.  
- **All API keys and data are stored locally in your browser only**—ensuring complete privacy and security. No data is sent to external servers except for translation requests.  
- **GTX Web API runs locally** to prevent server overload. Avoid using GTX Web in **global proxy mode** to prevent translation errors.  
- **For questions or feedback**, please feel free to contact us through the community or feedback page.  

## Future Updates

🚀 **Upcoming Features**:  
✅ **Standalone desktop version**  
✅ **AI-powered translation refinement**  

Subtitle Translator will continue to evolve based on user feedback. If you find this tool helpful, feel free to contribute or suggest improvements! 🚀

## Deployment  

Subtitle Translator can be deployed on Cloudflare, Vercel, EdgeOne, or any server.

[![Use EdgeOne Pages to deploy](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Frockbenben%2Fsubtitle-translator&output-directory=out&install-command=yarn+install&build-command=yarn+build%3Alang+en)

### Docker Deployment

The easiest way to run Subtitle Translator is using Docker:

```bash
# Using Docker Compose (Recommended)
docker-compose up -d

# Or using Docker directly
docker build -t subtitle-translator .
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your_openai_api_key_here \
  --name subtitle-translator \
  subtitle-translator
```

**Environment Variables for Docker:**
- `OPENAI_API_KEY`: Your OpenAI API key (required for batch functionality)
- `NEXT_PUBLIC_ENABLE_BATCH`: Enable batch mode (default: true)
- `ENABLE_SERVER_BATCH`: Enable server-side batch monitoring (default: true)

### Google OAuth Authentication Setup

For batch translation features, Google OAuth authentication is required. Follow these steps:

#### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Application type**: Web application
6. Add **Authorized redirect URIs**:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
7. Copy the **Client ID** and **Client Secret**

#### 2. Environment Variables Configuration

Create `.env.local` and `.env` files in the project root:

```bash
# NextAuth.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here

# OpenAI API Configuration (Optional)
OPENAI_API_KEY=your-openai-api-key-here
```

#### 3. Generate NEXTAUTH_SECRET

**Method 1: Using Node.js (Recommended)**
```bash
# Create a temporary file
echo "console.log(require('crypto').randomBytes(32).toString('hex'));" > temp.js
node temp.js
del temp.js  # Windows
rm temp.js  # Linux/Mac
```

**Method 2: Using OpenSSL**
```bash
openssl rand -hex 32
```

**Method 3: Online Tool**
- Visit https://generate-secret.vercel.app/32
- Generate a 32-character random string

#### 4. Update Docker Compose (Optional)

If using Docker Compose, update `docker-compose.yml`:

```yaml
environment:
  - NEXTAUTH_URL=http://localhost:3000
  - NEXTAUTH_SECRET=your-secret-key-here
  - GOOGLE_CLIENT_ID=your-google-client-id-here
  - GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

#### 5. Restart the Application

After setting up the environment variables:

```bash
# For Docker
docker-compose down
docker-compose up -d

# For local development
yarn dev
```

#### 6. Verify Authentication

1. Open http://localhost:3000
2. Go to **API Settings** → **OpenAI**
3. Enable **Batch Mode**
4. Click **Sign in with Google**
5. Complete the OAuth flow
6. You should see the **Batch Status Panel** for managing translation jobs

### Database Schema

The application uses SQLite for data persistence with the following key tables:

- **users**: Authenticated user information (Google OAuth)
- **subtitle_sources**: Original subtitle file metadata
- **subtitle_segments**: Individual subtitle segments
- **subtitle_segment_translations**: Translation results for each segment
- **batch_jobs**: OpenAI batch job tracking
- **token_usage**: API usage statistics

For detailed schema information, see `database-schema.md`.

### Troubleshooting

#### Common Issues

**1. Google OAuth Sign-in Not Working**
- **Error**: `client_id is required`
- **Solution**: Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are properly set in `.env.local`
- **Check**: Verify the redirect URI in Google Cloud Console matches `http://localhost:3000/api/auth/callback/google`

**2. NEXTAUTH_SECRET Generation Issues**
- **Error**: `node -e` command fails in PowerShell
- **Solution**: Use the temporary file method:
  ```bash
  echo "console.log(require('crypto').randomBytes(32).toString('hex'));" > temp.js
  node temp.js
  del temp.js
  ```

**3. Database Not Updating After Schema Changes**
- **Error**: Host OS database doesn't reflect container changes
- **Solution**: 
  ```bash
  docker-compose down
  del data\subtitle-translator.db  # Windows
  rm data/subtitle-translator.db   # Linux/Mac
  docker-compose up -d
  ```

**4. Hydration Errors**
- **Error**: `Hydration failed because the initial UI does not match what was rendered on the server`
- **Solution**: Clear browser cache (hard refresh: Ctrl+Shift+R) or try incognito mode

**5. Batch Translation Not Available**
- **Error**: Batch mode not showing in UI
- **Solution**: Ensure `NEXT_PUBLIC_ENABLE_BATCH=true` and `ENABLE_SERVER_BATCH=true` are set

#### Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NEXTAUTH_URL` | Yes | Application URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Yes | JWT signing secret | Generated |
| `GOOGLE_CLIENT_ID` | Yes* | Google OAuth Client ID | - |
| `GOOGLE_CLIENT_SECRET` | Yes* | Google OAuth Client Secret | - |
| `OPENAI_API_KEY` | No | OpenAI API key for batch mode | - |
| `NEXT_PUBLIC_ENABLE_BATCH` | No | Enable batch UI | `true` |
| `ENABLE_SERVER_BATCH` | No | Enable server-side batch | `true` |

*Required only for batch translation features

### Manual Installation

System Requirements:

- [Node.js 18.18](https://nodejs.org/) or later.
- macOS, Windows (including WSL), and Linux are supported.

```shell
# Installation
yarn

# Local Development
yarn dev

# build and start
yarn build && yarn start

# Deploy for a single language
yarn build:lang en
yarn build:lang zh
yarn build:lang zh-hant
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/[locale]/page.tsx`. The page auto-updates as you edit the file.

# 🎯 QuizTube AI — Video Quiz & Notes Generator (V1 Upgrade)

An advanced AI-powered learning tool that transforms YouTube videos (up to 45 minutes) into structured study notes, visual timelines, interactive quizzes, and interview preparation questions. 

By analyzing both **spoken audio** (via Groq Whisper V3) and **visual frame changes** (via NVIDIA NIM Vision APIs), QuizTube AI extracts code snippets, terminal commands, slides, and diagrams that traditional transcript-only tools miss.

---

## 🚀 Key Upgrades in V1

1. **Dual Audio-Visual Processing**:
   - Audio is transcribed at high quality using **Groq Whisper Large V3**.
   - Video frames are sampled at 1 frame per 5 seconds and analyzed using **NVIDIA NIM** (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` with `meta/llama-3.2-11b-vision-instruct` fallback).
2. **Graceful NVIDIA Degradation**:
   - If NVIDIA NIM endpoints fail or rate-limits hit, the system automatically degrades to **Transcript-Only mode** and continues notes/quiz generation seamlessly.
3. **Asynchronous Polling & Supabase Status Tracker**:
   - Solves gateway timeout errors by starting processing in the background and returning a `jobId`. 
   - A polling loop updates the user on current processing steps (e.g. "Extracting audio") and estimated remaining time.
   - Using **Supabase** ensures job status and completed results survive Render restarts.
4. **Duplicate Video Cache**:
   - Submissions matching a completed URL and job type processed within the last 7 days are served instantly from Supabase, bypassing AI requests to save API limits.
5. **API Rate Limiting**:
   - Protected with `express-rate-limit` (20 generation requests / 120 status requests per 15 minutes per IP).
6. **Timeline & Markdown Rendering**:
   - High-quality vertical visual timelines are generated and included in study notes.
   - Notes support markdown rendering (code blocks, inline commands, bold, italics) styled beautifully in dark mode.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML, Vanilla CSS, JS (Netlify-deployed) |
| **Backend** | Node.js, Express.js (Render Docker service) |
| **Database** | Supabase (Job state tracking & result cache) |
| **Video Engine** | `yt-dlp` (480p maximum) & `ffmpeg` (audio/frame splits) |
| **AI Models** | Groq (`whisper-large-v3`, `llama-3.3-70b-versatile`) |
| **Vision NIMs** | NVIDIA (`nemotron-3-nano-omni-30b-a3b-reasoning`, `llama-3.2-11b-vision-instruct`) |

---

## 🔧 Setup & Installation

### 1. Database Initialization
Create a table in your **Supabase Dashboard** -> **SQL Editor** by pasting the query in [supabase_schema.sql](file:///c:/Users/sai/Desktop/youtube_url/supabase_schema.sql). This sets up:
- The `jobs` status table.
- Row Level Security (RLS).
- An automatic trigger to synchronize `updated_at`.

### 2. Environment Configurations
Create a `.env` file at the root:
```env
PORT=8080
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GROQ_API_KEY=gsk_your_groq_key_here
NVIDIA_API_KEY=nvapi-your_nvidia_key_here
```
> [!IMPORTANT]
> **Security Requirement**: Always use `SUPABASE_SERVICE_ROLE_KEY` in the backend. This gives Express full write permission to clean up old rows and insert/update jobs. Never expose the service role key on Netlify or the frontend.

### 3. Install Dependencies & Run Locally
Make sure you have Node.js and Python installed. Then run:
```bash
# Install packages
npm install

# Run verification test script for NVIDIA models
node C:\Users\sai\.gemini\antigravity\brain\966618e7-1424-413d-bcdc-4e102273bff7\scratch\test_nvidia.js

# Launch the development server
npm run dev
```
Open `http://localhost:8080` in your browser.

---

## ☁️ Deployment

### Render (Backend)
Render requires system packages (`yt-dlp` and `ffmpeg`). We deploy the app as a **Web Service** using the [Dockerfile](file:///c:/Users/sai/Desktop/youtube_url/Dockerfile) provided in the project:
1. Connect your repository to Render.
2. Select **Docker** as the environment runtime.
3. Configure your Environment Variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`) in the Render dashboard.
4. Click **Deploy**.

### Netlify (Frontend)
1. Set the site API endpoint configuration in your frontend build settings.
2. Keep static files hosted on Netlify as usual.
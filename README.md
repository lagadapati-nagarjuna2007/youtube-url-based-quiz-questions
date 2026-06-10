# 🎯 YouTube Quiz & Notes Generator

## 🚀 Live Demo

https://youtube-url-based-quiz-questions.vercel.app/

---

## 📌 Problem Statement

An AI-powered learning tool that analyzes YouTube video transcripts to automatically generate **interactive quiz questions** or **structured study notes**. Just paste a YouTube URL, pick your mode, and let the AI do the rest!

---

## 🚀 Features

### 🧠 Quiz Mode
- 🔗 **Paste any YouTube URL** — supports standard, short (`youtu.be`), embed, and Shorts links
- 📄 **Auto transcript extraction** — fetches captions/subtitles directly from YouTube via RapidAPI
- 🤖 **AI-powered quiz generation** — uses Groq AI to analyze transcript and generate questions
- 🎚️ **Difficulty levels** — Easy, Medium, Hard
- 🔢 **Custom question count** — choose 5, 8, 10, or 15 questions
- 💡 **Instant explanations** — shows why each answer is correct after selection
- 📊 **Score tracking** — animated score ring with percentage on completion
- 🎉 **Confetti effect** — celebrates when you score 70% or above

### 📝 Notes Mode
- 📋 **Auto-structured notes** — AI organizes content into titled sections with key points
- 📖 **Definitions** — extracts and explains every technical term per section
- ⭐ **Key Takeaways** — numbered summary of the most important concepts
- 📚 **Full Glossary** — all important terms and definitions in one place
- ⬇️ **Download as PDF** — save notes locally as a formatted, premium multi-page document (with cover page, headers, footers, page numbers, and custom glossary) using `html2canvas` and `jsPDF`
- 🗂️ **Accordion layout** — expand/collapse sections for focused reading

### 🌐 General
- 🧠 **Multiple AI models** — Llama 3.3 70B, GPT-OSS 120B, Gemma2 9B
- 🏷️ **Topic chips** — shows subtopics covered in the video
- 📱 **Responsive UI** — works on desktop and mobile
- ⚡ **Smart token management** — auto-trims transcript per model's token limit to avoid API errors

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Vercel Serverless Functions (Node.js) |
| AI | Groq API (Llama 3.3 70B / GPT-OSS 120B / Gemma2 9B) |
| Transcript | YouTube Transcripts RapidAPI |
| Deployment | Vercel (free tier, no cold starts) |
| Env Config | `dotenv` / Vercel Environment Variables |

---

## 📁 Project Structure

```
youtube-quiz-notes-generator/
├── public/
│   ├── index.html        # Main UI (quiz + notes mode toggle)
│   ├── styles.css        # All styling (dark theme, animations)
│   └── script.js         # Frontend logic (quiz, notes, score, confetti)
├── api/
│   ├── _helpers.js       # Shared utilities (transcript fetch, Groq call)
│   ├── generate-quiz.js  # Serverless function — POST /api/generate-quiz
│   └── generate-notes.js # Serverless function — POST /api/generate-notes
├── vercel.json           # Vercel routing config
├── package.json          # Project dependencies
├── .env                  # API keys (not pushed to GitHub)
└── .gitignore            # Ignores node_modules and .env
```

---

## ⚙️ How It Works

### Quiz Mode
```
User pastes YouTube URL → selects difficulty & question count
        ↓
Vercel Serverless Function extracts Video ID
        ↓
Fetches transcript via RapidAPI
        ↓
Transcript trimmed to model's token limit
        ↓
Sends transcript to Groq AI with quiz prompt
        ↓
AI generates MCQ questions in JSON format
        ↓
Frontend renders interactive quiz
        ↓
User answers → sees score + explanations + confetti
```

### Notes Mode
```
User pastes YouTube URL → selects AI model
        ↓
Vercel Serverless Function extracts Video ID
        ↓
Fetches transcript via RapidAPI
        ↓
Transcript trimmed to model's token limit
        ↓
Sends transcript to Groq AI with notes prompt
        ↓
AI generates structured notes in JSON format
        ↓
Frontend renders sections, definitions, takeaways & glossary
        ↓
User can read, expand/collapse sections, or download as a paginated PDF
```

---

## 🔧 Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/lagadapati-nagarjuna2007/youtube-url-based-quiz-questions.git
cd youtube-url-based-quiz-questions
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env` file

```env
GROQ_API_KEY=your_groq_api_key_here
RAPIDAPI_KEY=your_rapidapi_key_here
```

> - Get your free Groq API key at [console.groq.com](https://console.groq.com)
> - Get your RapidAPI key at [rapidapi.com](https://rapidapi.com) — subscribe to the **YouTube Transcripts** API

### 4. Run locally with Vercel CLI

```bash
npm install -g vercel
vercel dev
```

### 5. Open in browser

```
http://localhost:3000
```

---

## ☁️ Deploy on Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "deploy to vercel"
git push
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework Preset → **Other**
4. Add Environment Variables:
   ```
   GROQ_API_KEY = your_groq_api_key_here
   RAPIDAPI_KEY = your_rapidapi_key_here
   ```
5. Click **Deploy** ✅

---

## 🎮 Usage

### Generate a Quiz
1. Paste a YouTube video URL into the input field
2. Make sure **Generate Quiz** tab is selected
3. Select number of questions (5 / 8 / 10 / 15)
4. Choose difficulty (Easy / Medium / Hard)
5. Choose an AI model
6. Click **Generate Quiz**
7. Answer the questions and see your score!

### Generate Study Notes
1. Paste a YouTube video URL into the input field
2. Click the **Generate Notes** tab
3. Choose an AI model
4. Click **Generate Notes**
5. Read through the structured sections, definitions, and takeaways
6. Click **Download** to save notes as a formatted PDF document

---

## 🤖 Available AI Models

| Model | Transcript Limit | Speed | Quality |
|-------|-----------------|-------|---------|
| `openai/gpt-oss-120b` | 3,500 chars | Fast | ⭐ Best |
| `llama-3.3-70b-versatile` | 7,000 chars | Fast | ⭐ Moderate |
| `gemma2-9b-it` | 5,000 chars | Fastest | ⭐ Moderate |

> **Note:** Transcript is automatically trimmed to each model's safe token limit to prevent API 413 errors.

---

## ⚠️ Requirements

- The YouTube video must have **captions / subtitles enabled**
- A valid **Groq API key** (free tier available)
- A valid **RapidAPI key** with YouTube Transcripts API subscription
- Node.js **v16+**

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/generate-quiz` | Generate quiz from YouTube URL |
| `POST` | `/api/generate-notes` | Generate study notes from YouTube URL |

### Request Body (both endpoints)
```json
{
  "url": "https://youtube.com/watch?v=VIDEO_ID",
  "model": "llama-3.3-70b-versatile",
  "qCount": 8,
  "difficulty": "medium"
}
```
> `qCount` and `difficulty` are only used by `/api/generate-quiz`

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙋‍♂️ Author

**Lagadapati Sai Nagarjuna**  
GitHub: [@lagadapati-nagarjuna2007](https://github.com/lagadapati-nagarjuna2007)
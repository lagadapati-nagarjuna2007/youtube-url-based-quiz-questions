# 🎯 YouTube URL Based Quiz Questions

An AI-powered quiz generator that analyzes YouTube video transcripts and automatically generates topic-based multiple-choice quiz questions. Just paste a YouTube URL, select your preferences, and let the AI do the rest!

---

## 🚀 Features

- 🔗 **Paste any YouTube URL** — supports standard, short (`youtu.be`), embed, and Shorts links
- 📄 **Auto transcript extraction** — fetches captions/subtitles directly from YouTube
- 🤖 **AI-powered quiz generation** — uses Groq AI to analyze transcript and generate questions
- 🎚️ **Difficulty levels** — Easy, Medium, Hard
- 🔢 **Custom question count** — choose 5, 8, 10, or 15 questions
- 🧠 **Multiple AI models** — Llama 3.3 70B, GPT-OSS 120B, Gemma2 9B
- 💡 **Instant explanations** — shows why each answer is correct after selection
- 📊 **Score tracking** — animated score ring with percentage on completion
- 🎉 **Confetti effect** — celebrates when you score 70% or above
- 🏷️ **Topic chips** — shows subtopics covered in the video
- 📱 **Responsive UI** — works on desktop and mobile

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| AI | Groq API (Llama 3.3 70B / GPT-OSS 120B / Gemma2 9B) |
| Transcript | `youtube-transcript` npm package |
| Env Config | `dotenv` |

---

## 📁 Project Structure

```
youtube-url-based-quiz-questions/
├── public folder
      |---index.html
      |---styles.css        # Frontend UI
      |---script.js        
├── styles.css         # All styling
├── script.js          # Frontend logic (quiz rendering, score, confetti)
├── server.js          # Express backend (transcript fetch + Groq API)
├── package.json       # Project dependencies
├── .env               # API keys (not pushed to GitHub)
└── .gitignore         # Ignores node_modules and .env
```

---

## ⚙️ How It Works

```
User pastes YouTube URL
        ↓
Backend extracts Video ID
        ↓
Fetches transcript using youtube-transcript
        ↓
Sends transcript to Groq AI with prompt
        ↓
AI generates quiz questions in JSON format
        ↓
Frontend renders interactive quiz
        ↓
User answers → sees score + explanations
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
```

> Get your free Groq API key at [console.groq.com](https://console.groq.com)

### 4. Run the app

```bash
npm start
```

### 5. Open in browser

```
http://localhost:3000
```

---

## 🎮 Usage

1. Paste a YouTube video URL into the input field
2. Select number of questions (5 / 8 / 10 / 15)
3. Choose difficulty (Easy / Medium / Hard)
4. Choose AI model (GPT-OSS 120B recommended for best quality)
5. Click **Generate Quiz**
6. Answer the questions and see your score!

---

## 🤖 Available AI Models

| Model | Speed | Quality |
|-------|-------|---------|
| `openai/gpt-oss-120b` | Fast | ⭐ Best |
| `llama-3.3-70b-versatile` | Fast | ⭐ Moderate |
| `gemma2-9b-it` | Fastest | ⭐ Moderate |

---

## ⚠️ Requirements

- The YouTube video must have **captions / subtitles enabled**
- A valid **Groq API key** (free tier available)
- Node.js **v16+**

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙋‍♂️ Author

**Lagadapati Sai Nagarjuna**  
GitHub: [@lagadapati-nagarjuna2007](https://github.com/lagadapati-nagarjuna2007)
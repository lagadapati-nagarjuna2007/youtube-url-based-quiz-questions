require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const FormData = require('form-data');
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Extract video ID from various YouTube URL formats ──
function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') || 
        (u.pathname.includes('/embed/') ? u.pathname.split('/embed/')[1].split('?')[0] : null) ||
        (u.pathname.includes('/shorts/') ? u.pathname.split('/shorts/')[1].split('?')[0] : null);
    }
  } catch (e) {}
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}


// ── Chunking configuration for transcripts ──
const CHUNK_SIZE = 12000; // ~2000 words / 15 minutes of speech
const MAX_CHUNKS = 5;     // Max 60,000 characters (~75 minutes of speech)

// ── Split transcript into cleanly-separated chunks ──
function splitTranscript(text, chunkSize = CHUNK_SIZE, maxChunks = MAX_CHUNKS) {
  const chunks = [];
  let currentIndex = 0;
  
  // Truncate to maximum characters we are willing to process
  const maxLen = chunkSize * maxChunks;
  const truncatedText = text.length > maxLen ? text.substring(0, maxLen) : text;
  
  while (currentIndex < truncatedText.length) {
    if (truncatedText.length - currentIndex <= chunkSize) {
      chunks.push(truncatedText.substring(currentIndex).trim());
      break;
    }
    
    let splitIndex = currentIndex + chunkSize;
    // Look backwards for a sentence ending to split cleanly
    const searchArea = truncatedText.substring(currentIndex, splitIndex);
    const lastPeriod = searchArea.lastIndexOf('. ');
    
    if (lastPeriod > chunkSize * 0.7) {
      splitIndex = currentIndex + lastPeriod + 1;
    } else {
      const lastSpace = searchArea.lastIndexOf(' ');
      if (lastSpace > chunkSize * 0.7) {
        splitIndex = currentIndex + lastSpace;
      }
    }
    
    chunks.push(truncatedText.substring(currentIndex, splitIndex).trim());
    currentIndex = splitIndex;
  }
  
  return chunks;
}

// ── Get audio stream URL from YTStream RapidAPI ──
async function getAudioStreamUrl(videoId) {
  const response = await fetch(
    `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`,
    {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    }
  );

  if (!response.ok) {
    throw new Error(`YTStream API error: ${response.status}`);
  }

  const data = await response.json();

  // YTStream returns adaptiveFormats and formats — pick audio only (lowest size)
  const formats = data.adaptiveFormats || [];
  const audioFormats = formats.filter(f => f.mimeType && f.mimeType.includes('audio'));

  if (!audioFormats.length) {
    throw new Error('No audio formats found in YTStream response');
  }

  // Pick lowest bitrate audio to keep size small for Whisper
  audioFormats.sort((a, b) => parseInt(a.bitrate) - parseInt(b.bitrate));
  const audioUrl = audioFormats[0].url;

  console.log(`✅ Audio stream URL obtained (bitrate: ${audioFormats[0].bitrate})`);
  return audioUrl;
}

// ── Transcribe audio URL directly via Groq Whisper ──
async function transcribeWithWhisper(audioUrl) {
  console.log(`⬇️  Fetching audio stream...`);

  // Fetch audio as buffer
  const audioResponse = await fetch(audioUrl, {
  headers: {
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  console.log(`✅ Audio fetched: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Check size — Groq Whisper limit is 25MB
  if (audioBuffer.length > 24 * 1024 * 1024) {
    throw new Error('Audio file too large for Whisper (>24MB). Video may be too long.');
  }

  // Send to Groq Whisper
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: 'audio/webm'
  });
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'text');
  formData.append('language', 'en');

  console.log(`🎙️  Transcribing via Groq Whisper...`);
  const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!whisperResponse.ok) {
    const err = await whisperResponse.json().catch(() => ({}));
    throw new Error(`Whisper API error ${whisperResponse.status}: ${err.error?.message || whisperResponse.statusText}`);
  }

  const transcript = await whisperResponse.text();
  console.log(`✅ Whisper transcript: ${transcript.length} chars`);
  return transcript.trim();
}

// ── Fetch transcript from YouTube (Whisper fallback via YTStream) ──
async function getTranscript(videoId) {
  // Try youtube-transcript first (subtitles)
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcriptArr || transcriptArr.length === 0) throw new Error('Empty transcript');
    const fullText = transcriptArr.map(c => c.text).join(' ');
    console.log(`✅ Subtitle transcript fetched (${fullText.length} chars)`);
    return fullText;
  } catch (subtitleErr) {
    console.warn(`⚠️ Subtitles unavailable: ${subtitleErr.message}`);
    console.log(`🔄 Falling back to Whisper via YTStream...`);

    // Fallback: YTStream → Whisper
    const audioUrl = await getAudioStreamUrl(videoId);
    return await transcribeWithWhisper(audioUrl);
  }
}

// ── Robust Groq fetch wrapper with exponential backoff for 429s ──
async function fetchGroq(body, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const waitTime = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : delay * Math.pow(2, i);
        console.warn(`⚠️ Groq API 429 Rate Limit. Waiting ${waitTime}ms before retry ${i + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Groq API error ${response.status}: ${errData.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      const waitTime = delay * Math.pow(2, i);
      console.warn(`⚠️ Groq Request failed: ${error.message}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// ── Call Groq API to generate quiz for a single chunk ──
async function generateQuizChunk(transcript, qCount, difficulty, model, chunkNum, totalChunks) {
  if (qCount <= 0) return { questions: [] };

  const prompt = `You are an expert educational quiz creator. Analyze the following section (Part ${chunkNum} of ${totalChunks}) of a YouTube video transcript and generate quiz questions based ONLY on the content discussed in this section.

TRANSCRIPT SECTION (Part ${chunkNum} of ${totalChunks}):
"""
${transcript}
"""

Based on this transcript section, generate exactly ${qCount} multiple-choice quiz questions at ${difficulty} difficulty level.

Rules:
- Questions must be DIRECTLY based on information found in this specific transcript section.
- Provide clear, educational explanations for correct answers.
- Identify the likely overall video title, main topic, and subtopics covered in this section.

CRITICAL: Respond with ONLY a raw JSON object. No markdown, no backticks, no code fences, no explanation.

{
  "videoTitle": "Best guess title of the video",
  "topic": "Main topic of the video",
  "topicsCovered": ["subtopic1", "subtopic2"],
  "questions": [
    {
      "question": "Question text here?",
      "options": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      "correct": 0,
      "explanation": "Why this answer is correct"
    }
  ]
}

The "correct" field is the 0-based index of the correct answer. Generate all ${qCount} questions.`;

  const data = await fetchGroq({
    model: model,
    max_tokens: 3000,
    temperature: 0.6,
    messages: [
      { 
        role: 'system', 
        content: 'You are an educational quiz generator. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.' 
      },
      { role: 'user', content: prompt }
    ]
  });

  let rawText = data.choices?.[0]?.message?.content || '';
  rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON found in AI response');
  rawText = rawText.slice(jsonStart, jsonEnd + 1);

  return JSON.parse(rawText);
}

// ── Orchestrate chunked quiz generation ──
async function generateQuizFromTranscript(transcript, qCount, difficulty, model) {
  const chunks = splitTranscript(transcript);
  console.log(`🧩 Splitting quiz transcript into ${chunks.length} chunks`);
  
  const results = [];
  const baseQCount = Math.floor(qCount / chunks.length);
  const remainder = qCount % chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunkQCount = baseQCount + (i === chunks.length - 1 ? remainder : 0);
    console.log(`👉 Processing quiz chunk ${i + 1}/${chunks.length} (generating ${chunkQCount} questions)`);
    const chunkResult = await generateQuizChunk(chunks[i], chunkQCount, difficulty, model, i + 1, chunks.length);
    results.push(chunkResult);
  }

  // Merge results
  const merged = {
    videoTitle: results[0]?.videoTitle || "YouTube Video Quiz",
    topic: results[0]?.topic || "General",
    topicsCovered: [],
    questions: []
  };

  const topicSet = new Set();
  results.forEach(res => {
    if (res.topicsCovered) {
      res.topicsCovered.forEach(t => topicSet.add(t));
    }
    if (res.questions) {
      merged.questions = merged.questions.concat(res.questions);
    }
  });
  merged.topicsCovered = Array.from(topicSet);

  return merged;
}

// ── API endpoint: Generate quiz ──
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { url, qCount = 8, difficulty = 'medium', model = 'llama-3.3-70b-versatile' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL. Please provide a valid YouTube link.' });
    }

    // Step 1: Fetch the transcript (full)
    console.log(`📄 Fetching transcript for video: ${videoId}`);
    const rawTranscript = await getTranscript(videoId);
    console.log(`✅ Transcript fetched (${rawTranscript.length} chars)`);

    // Step 2: Generate quiz using Groq AI
    console.log(`🤖 Generating ${qCount} ${difficulty} questions using ${model}...`);
    const quiz = await generateQuizFromTranscript(rawTranscript, qCount, difficulty, model);
    console.log(`✅ Quiz generated: ${quiz.questions?.length || 0} questions`);

    res.json({
      success: true,
      videoId,
      transcript: rawTranscript.substring(0, 500) + '...',
      quiz
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Call Groq API to generate notes for a single chunk ──
async function generateNotesChunk(transcript, model, chunkNum, totalChunks) {
  const prompt = `You are an expert educational note-taker and teacher. Analyze the following section (Part ${chunkNum} of ${totalChunks}) of a YouTube video transcript and generate detailed study notes based ONLY on the content discussed in this section.

TRANSCRIPT SECTION (Part ${chunkNum} of ${totalChunks}):
"""
${transcript}
"""

Based on this section, generate detailed study notes.

Rules:
- Extract ALL key concepts, definitions, classifications, and important information discussed.
- Organize notes in a clear, logical structure with section headers.
- Do NOT skip or generalize details—be thorough. Include subtopics and classifications (e.g. specific types/methods mentioned).
- Include definitions for every technical term mentioned in this section.

CRITICAL: Respond with ONLY a raw JSON object. No markdown, no backticks, no code fences, no explanation.

{
  "videoTitle": "Best guess title based on transcript content",
  "topic": "Main topic of the video",
  "topicsCovered": ["subtopic1", "subtopic2"],
  "summary": "1-2 sentence overview of this section's content",
  "sections": [
    {
      "title": "Section Title",
      "content": "Detailed notes for this section in plain text",
      "definitions": [
        { "term": "Technical Term", "definition": "Clear, simple definition of the term" }
      ],
      "bulletPoints": ["Key point 1", "Key point 2"]
    }
  ],
  "keyTakeaways": ["Important takeaway 1", "Important takeaway 2"],
  "importantTerms": [
    { "term": "Term", "definition": "Definition" }
  ]
}

Generate as many sections as needed to cover this section's content. Be thorough and educational.`;

  const data = await fetchGroq({
    model: model,
    max_tokens: 3500,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: 'You are an expert educational note-taker. Create comprehensive, well-structured study notes from video transcripts. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.'
      },
      { role: 'user', content: prompt }
    ]
  });

  let rawText = data.choices?.[0]?.message?.content || '';
  rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON found in AI response');
  rawText = rawText.slice(jsonStart, jsonEnd + 1);

  return JSON.parse(rawText);
}

// ── Orchestrate chunked notes generation ──
async function generateNotesFromTranscript(transcript, model) {
  const chunks = splitTranscript(transcript);
  console.log(`🧩 Splitting notes transcript into ${chunks.length} chunks`);

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`👉 Processing notes chunk ${i + 1}/${chunks.length}`);
    const chunkResult = await generateNotesChunk(chunks[i], model, i + 1, chunks.length);
    results.push(chunkResult);
  }

  // Merge results
  const merged = {
    videoTitle: results[0]?.videoTitle || "YouTube Video Notes",
    topic: results[0]?.topic || "General",
    topicsCovered: [],
    summary: "",
    sections: [],
    keyTakeaways: [],
    importantTerms: []
  };

  const topicSet = new Set();
  const takeawaySet = new Set();
  const termMap = new Map();
  const summaries = [];

  results.forEach((res, i) => {
    if (res.topicsCovered) {
      res.topicsCovered.forEach(t => topicSet.add(t));
    }
    if (res.summary) {
      summaries.push(`[Part ${i+1}]: ${res.summary}`);
    }
    if (res.sections) {
      merged.sections = merged.sections.concat(res.sections);
    }
    if (res.keyTakeaways) {
      res.keyTakeaways.forEach(kt => takeawaySet.add(kt));
    }
    if (res.importantTerms) {
      res.importantTerms.forEach(it => {
        if (it.term && it.definition) {
          termMap.set(it.term.toLowerCase(), it);
        }
      });
    }
  });

  merged.topicsCovered = Array.from(topicSet);
  merged.summary = summaries.join("\n\n");
  merged.keyTakeaways = Array.from(takeawaySet).slice(0, 12); // Limit to top 12 takeaways
  merged.importantTerms = Array.from(termMap.values());

  return merged;
}

// ── API endpoint: Generate notes ──
app.post('/api/generate-notes', async (req, res) => {
  try {
    const { url, model = 'llama-3.3-70b-versatile' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }

    console.log(`📄 Fetching transcript for notes: ${videoId}`);
    const rawTranscript = await getTranscript(videoId);
    console.log(`✅ Transcript fetched (${rawTranscript.length} chars)`);

    console.log(`📝 Generating notes using ${model}...`);
    const notes = await generateNotesFromTranscript(rawTranscript, model);
    console.log(`✅ Notes generated: ${notes.sections?.length || 0} sections`);

    res.json({ success: true, videoId, notes });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// ── Serve the frontend ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 YouTube Quiz Generator running at http://localhost:${PORT}`);
  console.log(`📺 Paste a YouTube link and let AI analyze the actual video content!\n`);
});
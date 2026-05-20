require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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


// ── Model token limits (conservative transcript char limits) ──
const MODEL_TRANSCRIPT_LIMITS = {
  'openai/gpt-oss-120b': 3500,   // 8K TPM total; prompt overhead ~1.5K, leave ~3.5K for transcript
  'gemma2-9b-it':        5000,   // moderate context
  'llama-3.3-70b-versatile': 7000 // generous context
};

function trimTranscript(text, model) {
  const limit = MODEL_TRANSCRIPT_LIMITS[model] || 5000;
  return text.length > limit ? text.substring(0, limit) + '...' : text;
}
// ── Fetch transcript from YouTube ──
async function getTranscript(videoId) {
  try {
    const response = await fetch(
      `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&chunkSize=500&lang=en`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'youtube-transcripts.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      }
    );

    const data = await response.json();

    if (!data.content || data.content.length === 0) {
      throw new Error('No transcript available for this video.');
    }

    const fullText = data.content.map(c => c.text).join(' ');
    return fullText; // callers trim based on model limits

  } catch (error) {
    throw new Error(`Could not fetch transcript: ${error.message}`);
  }
}

// ── Call Groq API to generate quiz ──
async function generateQuizFromTranscript(transcript, qCount, difficulty, model) {
  const prompt = `You are an expert educational quiz creator. Analyze the following YouTube video transcript and generate a quiz based on the ACTUAL content discussed in the video.

VIDEO TRANSCRIPT:
"""
${transcript}
"""

Based on this transcript, generate exactly ${qCount} multiple-choice quiz questions at ${difficulty} difficulty level.

Rules:
- Questions must be DIRECTLY based on information found in the transcript
- Each question should test understanding of key concepts discussed
- Provide clear, educational explanations for correct answers
- Identify the main topic and video title from the transcript content

CRITICAL: Respond with ONLY a raw JSON object. No markdown, no backticks, no code fences, no explanation.

{
  "videoTitle": "Best guess title based on transcript content",
  "topic": "Main topic covered in the video",
  "topicsCovered": ["subtopic1", "subtopic2", "subtopic3"],
  "questions": [
    {
      "question": "Question text here?",
      "options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"],
      "correct": 0,
      "explanation": "Why this answer is correct, referencing the video content"
    }
  ]
}

The "correct" field is the 0-based index of the correct answer. Generate all ${qCount} questions.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      temperature: 0.6,
      messages: [
        { 
          role: 'system', 
          content: 'You are an educational quiz generator that creates questions based on video transcripts. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.' 
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Groq API error ${response.status}: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let rawText = data.choices?.[0]?.message?.content || '';
  
  // Clean up response
  rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON found in AI response');
  rawText = rawText.slice(jsonStart, jsonEnd + 1);

  return JSON.parse(rawText);
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

    // Step 1: Fetch the transcript
    console.log(`📄 Fetching transcript for video: ${videoId}`);
    const rawTranscript = await getTranscript(videoId);
    const transcript = trimTranscript(rawTranscript, model);
    console.log(`✅ Transcript fetched (${rawTranscript.length} chars → trimmed to ${transcript.length})`);

    // Step 2: Generate quiz using Groq AI
    console.log(`🤖 Generating ${qCount} ${difficulty} questions using ${model}...`);
    const quiz = await generateQuizFromTranscript(transcript, qCount, difficulty, model);
    console.log(`✅ Quiz generated: ${quiz.questions?.length || 0} questions`);

    res.json({
      success: true,
      videoId,
      transcript: transcript.substring(0, 500) + '...', // Send preview of transcript
      quiz
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Call Groq API to generate notes ──
async function generateNotesFromTranscript(transcript, model) {
  const prompt = `You are an expert educational note-taker and teacher. Analyze the following YouTube video transcript and generate comprehensive, well-structured study notes that a student can use for learning and revision.

VIDEO TRANSCRIPT:
"""
${transcript}
"""

Based on this transcript, generate detailed study notes.

Rules:
- Extract ALL key concepts, definitions, and important information
- Organize notes in a clear, logical structure with sections
- Include definitions for every technical term mentioned
- Add "Key Takeaways" at the end
- Identify the video title and main topic from the transcript

CRITICAL: Respond with ONLY a raw JSON object. No markdown, no backticks, no code fences, no explanation.

{
  "videoTitle": "Best guess title based on transcript content",
  "topic": "Main topic of the video",
  "topicsCovered": ["subtopic1", "subtopic2", "subtopic3"],
  "summary": "2-3 sentence overview of the entire video content",
  "sections": [
    {
      "title": "Section Title",
      "content": "Detailed notes for this section in plain text",
      "definitions": [
        { "term": "Technical Term", "definition": "Clear, simple definition of the term" }
      ],
      "bulletPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
  ],
  "keyTakeaways": ["Most important thing 1", "Most important thing 2", "Most important thing 3"],
  "importantTerms": [
    { "term": "Term", "definition": "Definition" }
  ]
}

Generate as many sections as needed to cover all content. Be thorough and educational.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 6000,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational note-taker. Create comprehensive, well-structured study notes from video transcripts. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Groq API error ${response.status}: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let rawText = data.choices?.[0]?.message?.content || '';

  rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON found in AI response');
  rawText = rawText.slice(jsonStart, jsonEnd + 1);

  return JSON.parse(rawText);
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
    const transcript = trimTranscript(rawTranscript, model);
    console.log(`✅ Transcript fetched (${rawTranscript.length} chars → trimmed to ${transcript.length})`);

    console.log(`📝 Generating notes using ${model}...`);
    const notes = await generateNotesFromTranscript(transcript, model);
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
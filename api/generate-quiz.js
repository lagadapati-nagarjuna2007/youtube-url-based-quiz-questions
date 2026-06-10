// ============================================================
// api/generate-quiz.js — Vercel Serverless Function
// Replaces Express POST /api/generate-quiz
// ============================================================

const { extractVideoId, trimTranscript, getTranscript, callGroq } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, qCount = 8, difficulty = 'medium', model = 'llama-3.3-70b-versatile' } = req.body;

    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL. Please provide a valid YouTube link.' });

    // Step 1: Fetch transcript
    const rawTranscript = await getTranscript(videoId);
    const transcript = trimTranscript(rawTranscript, model);

    // Step 2: Generate quiz via Groq
    const quiz = await callGroq({
      model,
      maxTokens: 4000,
      temperature: 0.6,
      systemPrompt: 'You are an educational quiz generator that creates questions based on video transcripts. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.',
      userPrompt: `You are an expert educational quiz creator. Analyze the following YouTube video transcript and generate a quiz based on the ACTUAL content discussed in the video.

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

The "correct" field is the 0-based index of the correct answer. Generate all ${qCount} questions.`
    });

    res.json({
      success: true,
      videoId,
      transcript: transcript.substring(0, 500) + '...',
      quiz
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
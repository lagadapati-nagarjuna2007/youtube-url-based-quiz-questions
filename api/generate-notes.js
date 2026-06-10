// ============================================================
// api/generate-notes.js — Vercel Serverless Function
// Replaces Express POST /api/generate-notes
// ============================================================

const { extractVideoId, trimTranscript, getTranscript, callGroq } = require('./_helpers');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, model = 'llama-3.3-70b-versatile' } = req.body;

    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL.' });

    // Step 1: Fetch transcript
    const rawTranscript = await getTranscript(videoId);
    const transcript = trimTranscript(rawTranscript, model);

    // Step 2: Generate notes via Groq
    const notes = await callGroq({
      model,
      maxTokens: 6000,
      temperature: 0.4,
      systemPrompt: 'You are an expert educational note-taker. Create comprehensive, well-structured study notes from video transcripts. Always respond with valid raw JSON only — no markdown, no backticks, no extra text.',
      userPrompt: `You are an expert educational note-taker and teacher. Analyze the following YouTube video transcript and generate comprehensive, well-structured study notes.

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

Generate as many sections as needed to cover all content. Be thorough and educational.`
    });

    res.json({ success: true, videoId, notes });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
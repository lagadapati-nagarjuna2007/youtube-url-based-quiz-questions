// ============================================================
// api/_helpers.js — Shared utilities for all API routes
// (Vercel ignores files starting with _ in the api/ folder)
// ============================================================

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

// ── Model token limits ──
const MODEL_TRANSCRIPT_LIMITS = {
  'openai/gpt-oss-120b': 3500,
  'gemma2-9b-it': 5000,
  'llama-3.3-70b-versatile': 7000
};

function trimTranscript(text, model) {
  const limit = MODEL_TRANSCRIPT_LIMITS[model] || 5000;
  return text.length > limit ? text.substring(0, limit) + '...' : text;
}

// ── Fetch transcript from RapidAPI ──
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

    return data.content.map(c => c.text).join(' ');
  } catch (error) {
    throw new Error(`Could not fetch transcript: ${error.message}`);
  }
}

// ── Call Groq API ──
async function callGroq({ model, systemPrompt, userPrompt, maxTokens = 4000, temperature = 0.6 }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Groq API error ${response.status}: ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let rawText = data.choices?.[0]?.message?.content || '';

  // Clean JSON response
  rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No valid JSON found in AI response');

  return JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
}

module.exports = { extractVideoId, trimTranscript, getTranscript, callGroq };
// src/groq.js - Groq SDK wrapper for audio transcription and chat completions
const fs = require('fs');
const Groq = require('groq-sdk');
const config = require('./config');

const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY,
  timeout: 5 * 60 * 1000 // 5 minutes in milliseconds to handle larger audio uploads on Render
});

/**
 * Transcribes audio file into text using Groq Whisper Large V3
 * @param {string} audioFilePath - Path to local mp3 audio file
 * @param {number} [estimatedDurationSeconds] - Optional estimated duration of the audio in seconds
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioFilePath, estimatedDurationSeconds) {
  // Log details before transcription
  if (!fs.existsSync(audioFilePath)) {
    console.log(`[Whisper] File check: Audio file DOES NOT exist at ${audioFilePath}`);
    throw new Error(`Audio file not found at ${audioFilePath}`);
  }
  
  const stats = fs.statSync(audioFilePath);
  console.log(`[Whisper] File check: Audio file exists at ${audioFilePath}`);
  console.log(`[Whisper] File size: ${stats.size} bytes (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
  
  if (estimatedDurationSeconds) {
    const mins = Math.floor(estimatedDurationSeconds / 60);
    const secs = estimatedDurationSeconds % 60;
    console.log(`[Whisper] Audio duration: ${mins}m ${secs}s (${estimatedDurationSeconds} seconds)`);
  } else {
    console.log(`[Whisper] Audio duration: Not provided`);
  }

  // Retry logic (3 attempts, exponential backoff)
  let attempt = 0;
  const maxAttempts = 3;
  let transcription = null;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      console.log(`[Whisper] Transcription attempt ${attempt} of ${maxAttempts}...`);
      
      // Use stream-based upload for compatibility and memory efficiency
      transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: config.WHISPER_MODEL
      });
      
      if (!transcription || !transcription.text) {
        throw new Error('Transcription returned an empty response.');
      }
      
      console.log(`[Whisper] Attempt ${attempt} succeeded!`);
      return transcription.text;
      
    } catch (err) {
      lastError = err;
      console.error(`[Whisper] Attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt) * 1000; // 2000ms (attempt 1), 4000ms (attempt 2)
        console.log(`[Whisper] Waiting ${delayMs / 1000}s before retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`Groq Whisper transcription failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
}

/**
 * Calls Groq Chat Completions API with structured prompts and returns parsed JSON
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<object>} - Parsed JSON object
 */
async function callGroqLLM({
  systemPrompt,
  userPrompt,
  model = config.DEFAULT_REASONING_MODEL,
  temperature = 0.3,
  maxTokens = 4000
}) {
  try {
    const response = await groq.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    let rawText = response.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if LLM wrapped it in ```json ... ```
    rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('Raw content that failed JSON parsing:', rawText);
      throw new Error('No valid JSON found in AI response');
    }
    
    const cleanJsonString = rawText.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(cleanJsonString);
  } catch (err) {
    throw new Error(`Groq LLM completion failed: ${err.message}`);
  }
}

module.exports = {
  transcribeAudio,
  callGroqLLM
};

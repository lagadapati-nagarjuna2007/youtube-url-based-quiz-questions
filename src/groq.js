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
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioFilePath) {
  try {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found at ${audioFilePath}`);
    }
    
    const transcription = await groq.audio.transcriptions.create({
      file: await Groq.toFile(fs.readFileSync(audioFilePath), 'audio.mp3'),
      model: config.WHISPER_MODEL
    });
    
    if (!transcription || !transcription.text) {
      throw new Error('Transcription returned an empty response.');
    }
    
    return transcription.text;
  } catch (err) {
    throw new Error(`Groq Whisper transcription failed: ${err.message}`);
  }
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

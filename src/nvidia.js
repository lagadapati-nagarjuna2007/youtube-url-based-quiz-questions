// src/nvidia.js - NVIDIA NIM vision analysis with model fallback and batching
const fs = require('fs');
const config = require('./config');

/**
 * Encodes a local file to base64
 * @param {string} filePath 
 * @returns {string} base64 string
 */
function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

/**
 * Sends a batch of frames to the NVIDIA NIM API for visual analysis
 * @param {Array<object>} subBatch - Array of { path, timestamp, timestampSeconds }
 * @param {string} modelName - Model name to query
 * @returns {Promise<string>} - Text summary of the frames
 */
async function queryNvidiaModel(subBatch, modelName) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured in environment.');
  }

  // Construct structured messages content
  const content = [
    {
      type: 'text',
      text: `You are an expert technical teacher and OCR system. 
Analyze the following chronological screenshots from a video tutorial.
For each frame, extract any visible:
1. Source code (transcribe code blocks exactly).
2. Terminal commands and terminal output (lines, command line prompts).
3. Slide titles, bullet lists, or visual text.
4. Diagram explanations, flowcharts, or architecture layouts.

You must identify each frame by its timestamp and index.`
    }
  ];

  // Append images in sequence
  subBatch.forEach((frame, idx) => {
    const base64Image = fileToBase64(frame.path);
    content.push({
      type: 'text',
      text: `--- Image ${idx + 1} (Timestamp: ${frame.timestamp}) ---`
    });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${base64Image}`
      }
    });
  });

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 4096,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`NVIDIA API status ${response.status}: ${JSON.stringify(errorBody)}`);
  }

  const responseData = await response.json();
  return responseData.choices?.[0]?.message?.content || '';
}

/**
 * Analyzes all extracted frames by batching them and running vision LLM
 * Supports primary model, fallback model, and graceful degradation
 * @param {Array<object>} frames - Array of frame objects { path, timestamp, timestampSeconds }
 * @param {Function} [onProgressUpdate] - Callback function for updating progress
 * @returns {Promise<object>} - { success: boolean, timelineLog: string, visualAnalysisState: string }
 */
async function analyzeFrames(frames, onProgressUpdate = () => {}) {
  if (!frames || frames.length === 0) {
    return { success: false, timelineLog: '', batchResults: [], visualAnalysisState: 'unavailable' };
  }

  console.log(`Starting visual analysis of ${frames.length} frames...`);
  const batchSize = config.FRAME_BATCH_SIZE;
  const results = [];
  const batchResults = [];
  
  // Group frames into batches of size config.FRAME_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < frames.length; i += batchSize) {
    batches.push(frames.slice(i, i + batchSize));
  }

  let visualAnalysisState = 'success';

  for (let i = 0; i < batches.length; i++) {
    const subBatch = batches[i];
    const batchNum = i + 1;
    const startFrame = i * batchSize + 1;
    const endFrame = Math.min((i + 1) * batchSize, frames.length);
    
    const statusMsg = `Analyzing frames ${startFrame}-${endFrame}/${frames.length}`;
    console.log(statusMsg);
    onProgressUpdate(batchNum, batches.length, statusMsg);

    let resultText = '';
    try {
      // 1. Try Primary Model
      resultText = await queryNvidiaModel(subBatch, config.PRIMARY_VISION_MODEL);
    } catch (primaryError) {
      console.warn(`Primary NVIDIA model failed on batch ${batchNum}: ${primaryError.message}. Retrying with fallback...`);
      
      try {
        // 2. Try Fallback Model
        resultText = await queryNvidiaModel(subBatch, config.FALLBACK_VISION_MODEL);
      } catch (fallbackError) {
        console.error(`Fallback NVIDIA model failed on batch ${batchNum} as well: ${fallbackError.message}`);
        
        // 3. Graceful degradation: do not crash the job, mark it as unavailable
        console.warn('⚠️ NVIDIA vision APIs are unavailable. Gracefully degrading to transcript-only mode.');
        visualAnalysisState = 'unavailable';
        return { success: false, timelineLog: '', batchResults: [], visualAnalysisState };
      }
    }

    results.push(resultText);

    const timestamps = subBatch.map(f => f.timestampSeconds);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    batchResults.push({
      text: resultText,
      startSeconds: minTime,
      endSeconds: maxTime
    });
  }

  const combinedTimelineLog = results.join('\n\n');
  return {
    success: true,
    timelineLog: combinedTimelineLog,
    batchResults,
    visualAnalysisState
  };
}

module.exports = {
  analyzeFrames
};

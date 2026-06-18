// src/pipeline.js - Core video processing and content generation pipeline
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const config = require('./config');
const { updateJob } = require('./supabase');
const { transcribeAudio, callGroqLLM } = require('./groq');
const { analyzeFrames } = require('./nvidia');
const { formatSeconds, ensureDirectoryExists, cleanupPath } = require('./utils');

/**
 * Safely writes cookies content (if configured) to a temp file and returns its path
 * @param {string} tempDir 
 * @returns {string|null}
 */
function getCookiesFilePath(tempDir) {
  const cookiesBase64 = process.env.YOUTUBE_COOKIES_BASE64;
  const cookiesText = process.env.YOUTUBE_COOKIES;
  
  if (cookiesBase64) {
    try {
      const cookiesContent = Buffer.from(cookiesBase64, 'base64').toString('utf-8');
      const cookiesPath = path.join(tempDir, 'cookies.txt');
      fs.writeFileSync(cookiesPath, cookiesContent, 'utf-8');
      console.log(`Successfully wrote cookies from YOUTUBE_COOKIES_BASE64 to ${cookiesPath}`);
      return cookiesPath;
    } catch (err) {
      console.error('Failed to decode YOUTUBE_COOKIES_BASE64:', err.message);
    }
  }
  
  if (cookiesText) {
    try {
      const cookiesPath = path.join(tempDir, 'cookies.txt');
      fs.writeFileSync(cookiesPath, cookiesText, 'utf-8');
      console.log(`Successfully wrote cookies from YOUTUBE_COOKIES to ${cookiesPath}`);
      return cookiesPath;
    } catch (err) {
      console.error('Failed to write YOUTUBE_COOKIES:', err.message);
    }
  }
  
  return null;
}

/**
 * Gets video metadata using yt-dlp without downloading
 * @param {string} youtubeUrl 
 * @param {string} tempDir
 * @returns {Promise<object>} - { title, duration, thumbnail }
 */
function getVideoMetadata(youtubeUrl, tempDir) {
  return new Promise((resolve, reject) => {
    const cookiesPath = getCookiesFilePath(tempDir);
    const args = [
      '--skip-download',
      '--dump-json',
      '--js-runtimes', 'node',
      youtubeUrl
    ];
    
    if (cookiesPath) {
      args.unshift('--cookies', cookiesPath);
    }
    
    console.log(`Running metadata extraction: yt-dlp ${args.join(' ')}`);
    const proc = spawn('yt-dlp', args);
    
    let stdoutData = '';
    let stderrData = '';
    
    proc.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Metadata extraction failed: ${stderrData || `exit code ${code}`}`));
      }
      try {
        const metadata = JSON.parse(stdoutData);
        resolve({
          title: metadata.title || 'YouTube Video',
          duration: parseInt(metadata.duration) || 0,
          thumbnail: metadata.thumbnail || `https://img.youtube.com/vi/${metadata.id}/mqdefault.jpg`
        });
      } catch (err) {
        reject(new Error(`Failed to parse metadata JSON: ${err.message}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Downloads YouTube video using yt-dlp at 480p maximum
 * @param {string} youtubeUrl 
 * @param {string} outputPath 
 * @param {string} tempDir
 * @returns {Promise<void>}
 */
function downloadVideo(youtubeUrl, outputPath, tempDir) {
  return new Promise((resolve, reject) => {
    const cookiesPath = getCookiesFilePath(tempDir);
    const args = [
      '-f', config.DOWNLOAD_QUALITY,
      '-o', outputPath,
      '--js-runtimes', 'node',
      youtubeUrl
    ];
    
    if (cookiesPath) {
      args.unshift('--cookies', cookiesPath);
    }
    
    console.log(`Running download: yt-dlp ${args.join(' ')}`);
    const proc = spawn('yt-dlp', args);
    
    let stderrData = '';
    proc.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp failed with exit code ${code}. Error: ${stderrData}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Extracts mono 16kHz MP3 audio from a video using FFmpeg
 * @param {string} videoPath 
 * @param {string} audioPath 
 * @returns {Promise<void>}
 */
function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ab', '64k',
      '-ac', '1',
      '-ar', '16000',
      '-y',
      audioPath
    ];

    console.log(`Running FFmpeg audio: ${ffmpegPath} ${args.join(' ')}`);
    const proc = spawn(ffmpegPath, args);
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg audio extraction failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Extracts video frames with scene change detection and parses timestamps from showinfo logs
 * @param {string} videoPath 
 * @param {string} framesDir 
 * @returns {Promise<Array<object>>} - Array of { path, timestamp, timestampSeconds }
 */
function extractFramesAndTimestamps(videoPath, framesDir) {
  return new Promise((resolve, reject) => {
    // Escaped filters for FFmpeg inside selection
    const filter = `fps=${config.FRAME_SAMPLING_RATE},select=eq(n\\,0)+gt(scene\\,${config.FFMPEG_SCENE_THRESHOLD}),showinfo`;
    const args = [
      '-i', videoPath,
      '-vf', filter,
      '-vsync', 'vfr',
      '-y',
      path.join(framesDir, 'frame_%03d.png')
    ];

    console.log(`Running FFmpeg frames: ${ffmpegPath} ${args.join(' ')}`);
    const proc = spawn(ffmpegPath, args);
    
    const showinfoRegex = /n:\s*(\d+)\s+pts:\s*\d+\s+pts_time:\s*([0-9.]+)/g;
    const parsedTimestamps = [];
    
    let stderrAccumulator = '';
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrAccumulator += text;
      
      let match;
      // Extract timestamps in real-time
      while ((match = showinfoRegex.exec(text)) !== null) {
        const seconds = parseFloat(match[2]);
        parsedTimestamps.push(seconds);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg frame extraction failed with exit code ${code}`));
      }

      try {
        const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
        const frames = [];

        files.forEach((file, index) => {
          // If the parsed timestamp is missing, fallback to estimated interval (every 5 seconds)
          const seconds = parsedTimestamps[index] !== undefined ? parsedTimestamps[index] : index * 5;
          
          // Helper to convert seconds into HH:MM:SS or MM:SS format
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          const hrs = Math.floor(mins / 60);
          const pad = (n) => String(n).padStart(2, '0');
          const timestamp = hrs > 0 ? `${pad(hrs)}:${pad(mins % 60)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;

          frames.push({
            path: path.join(framesDir, file),
            timestamp,
            timestampSeconds: seconds
          });
        });

        resolve(frames);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Formats seconds to estimated human duration
 * @param {number} totalSeconds 
 */
function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Coordinate and execute the full processing pipeline asynchronously
 * @param {string} jobId 
 * @param {string} youtubeUrl 
 * @param {string} jobType 
 */
async function runPipeline(jobId, youtubeUrl, jobType) {
  const startTime = Date.now();
  const tempDir = path.join(process.cwd(), 'temp', 'downloads', jobId);
  const videoPath = path.join(tempDir, 'video.mp4');
  const audioPath = path.join(tempDir, 'audio.mp3');
  const framesDir = path.join(tempDir, 'frames');

  try {
    ensureDirectoryExists(tempDir);
    ensureDirectoryExists(framesDir);

    // ========================================================
    // STAGE 1: METADATA & DURATION VALIDATION
    // ========================================================
    console.log(`[Job ${jobId}] Fetching metadata...`);
    await updateJob(jobId, { progress: 3, current_step: 'Fetching video metadata' });
    
    const metadata = await getVideoMetadata(youtubeUrl, tempDir);
    console.log(`[Job ${jobId}] Metadata fetched: "${metadata.title}" (${formatDuration(metadata.duration)})`);

    if (metadata.duration > config.MAX_VIDEO_DURATION_SECONDS) {
      throw new Error('Version 1 currently supports videos up to 45 minutes. Longer videos will be supported in a future release.');
    }

    // ========================================================
    // STAGE 2: DOWNLOAD VIDEO (480p MAX)
    // ========================================================
    console.log(`[Job ${jobId}] Downloading video...`);
    await updateJob(jobId, { progress: 10, current_step: 'Downloading video' });
    await downloadVideo(youtubeUrl, videoPath, tempDir);

    // ========================================================
    // STAGE 3: EXTRACT AUDIO
    // ========================================================
    console.log(`[Job ${jobId}] Extracting audio...`);
    await updateJob(jobId, { progress: 25, current_step: 'Extracting audio' });
    await extractAudio(videoPath, audioPath);

    // ========================================================
    // STAGE 4: EXTRACT FRAMES WITH SCENE DETECTION
    // ========================================================
    console.log(`[Job ${jobId}] Extracting frames...`);
    await updateJob(jobId, { progress: 40, current_step: 'Extracting video frames' });
    const frames = await extractFramesAndTimestamps(videoPath, framesDir);
    console.log(`[Job ${jobId}] Extracted ${frames.length} unique frames after scene detection.`);

    // ========================================================
    // STAGE 5: SPEECH TRANSCRIPTION
    // ========================================================
    console.log(`[Job ${jobId}] Transcribing speech...`);
    await updateJob(jobId, { progress: 50, current_step: 'Transcribing speech' });
    const transcriptText = await transcribeAudio(audioPath);

    // ========================================================
    // STAGE 6: NVIDIA VISION FRAME ANALYSIS
    // ========================================================
    console.log(`[Job ${jobId}] Analyzing video frames...`);
    await updateJob(jobId, { progress: 60, current_step: 'Analyzing video frames' });
    
    // Callback to update progress during the batch loop
    const onNvidiaProgress = async (currentBatch, totalBatches, statusMsg) => {
      // Scale NVIDIA progress contribution from 60% to 80%
      const nvidiaProgress = 60 + Math.round((currentBatch / totalBatches) * 20);
      await updateJob(jobId, { progress: nvidiaProgress, current_step: statusMsg });
    };

    const visionResult = await analyzeFrames(frames, onNvidiaProgress);
    const hasVisuals = visionResult.success;
    const timelineLog = visionResult.timelineLog;
    const visualAnalysisState = visionResult.visualAnalysisState;

    // ========================================================
    // STAGE 7: CONTENT GENERATION (GROQ LLM)
    // ========================================================
    console.log(`[Job ${jobId}] Generating content...`);
    await updateJob(jobId, { progress: 85, current_step: 'Generating final notes and quizzes' });

    let finalResult = null;

    if (jobType === 'notes') {
      // ── Notes Generation Prompts ──
      const systemPrompt = `You are an expert educational note-taker. Create comprehensive study notes. Always respond with valid raw JSON only — no markdown ticks, no backticks, no extra text.`;
      
      let userPrompt = `You are a professional educational note-taker and teacher. Analyze the following video content and generate detailed, lecture-quality notes.
      
VIDEO TRANSCRIPT:
"""
${transcriptText}
"""
`;

      if (hasVisuals && timelineLog) {
        userPrompt += `

VISUAL TIMELINE AND OCR CONTENT (Captured from slides, terminal outputs, and code on screen):
"""
${timelineLog}
"""

Instructions for Visual Content:
1. Integrate the source code blocks, terminal commands, terminal outputs, slide details, and diagrams EXACTLY as they appear at their respective timestamps.
2. In the notes sections, describe flowcharts, structures, and slides content clearly.
`;
      }

      userPrompt += `

Generate detailed study notes containing:
1. "videoTitle": A precise title based on transcript and video content.
2. "topic": Main topic.
3. "topicsCovered": List of subtopics covered.
4. "summary": A 3-4 sentence overview of the video.
5. "timeline": Create a structured visual timeline mapping timestamps to major events or slide topics (e.g. 00:02:15 - "Intro to Node.js", 00:05:30 - "Express setup"). Output as an array of { "timestamp": "string", "topic": "string" }.
6. "sections": Array of detailed notes sections. Each section must contain:
   - "title": Section heading.
   - "content": Detailed notes in plain text, supporting markdown (like **bold**, italics, and code blocks using standard \`\`\`js ... \`\`\` backticks).
   - "definitions": Array of { "term": "string", "definition": "string" } for technical terms discussed in this section.
   - "bulletPoints": Key points summarized as a bulleted list.
7. "keyTakeaways": A list of the most critical high-level takeaways.
8. "importantTerms": A combined glossary of all key technical terms and definitions.
9. "interviewQuestions": Create exactly 5-8 interview preparation questions based on this video content. Format as an array of { "question": "string", "answer": "string" }.

CRITICAL: Respond with ONLY a raw JSON object. Do not wrap in markdown \`\`\`json. Do not explain.
`;

      const notesResponse = await callGroqLLM({
        systemPrompt,
        userPrompt,
        model: config.DEFAULT_REASONING_MODEL,
        maxTokens: 6000,
        temperature: 0.3
      });

      finalResult = notesResponse;

    } else {
      // ── Quiz Generation Prompts ──
      const systemPrompt = `You are an educational quiz creator. Create interactive questions based on video content. Always respond with valid raw JSON only — no markdown ticks, no backticks, no extra text.`;
      
      let userPrompt = `You are an expert quiz designer. Analyze the following video content and generate an interactive quiz based on what was discussed or shown.
      
VIDEO TRANSCRIPT:
"""
${transcriptText}
"""
`;

      if (hasVisuals && timelineLog) {
        userPrompt += `

VISUAL TIMELINE AND OCR CONTENT (From code, slides, and terminals on screen):
"""
${timelineLog}
"""
`;
      }

      userPrompt += `

Generate exactly 8 multiple-choice quiz questions based on the video content.
Rules:
- Questions must test the concepts from both verbal narration and visual slides/code.
- Include a variety of questions: conceptual, scenario-based, terminal commands, or code-reading (if present).
- Provide a clear, educational explanation for the correct answer.

JSON Output Schema:
{
  "videoTitle": "Precise title of the video",
  "topic": "Main topic",
  "topicsCovered": ["subtopic1", "subtopic2"],
  "questions": [
    {
      "question": "Question text here?",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correct": 0, // 0-based index of correct option
      "explanation": "Clear explanation referencing the video content"
    }
  ]
}

CRITICAL: Respond with ONLY a raw JSON object. Do not wrap in markdown \`\`\`json. Do not explain.
`;

      const quizResponse = await callGroqLLM({
        systemPrompt,
        userPrompt,
        model: config.DEFAULT_REASONING_MODEL,
        maxTokens: 4000,
        temperature: 0.5
      });

      finalResult = quizResponse;
    }

    // ========================================================
    // STAGE 8: COMPLETION & METADATA SAVE
    // ========================================================
    const elapsedTimeSeconds = Math.round((Date.now() - startTime) / 1000);
    
    // Inject debug and optimization metadata
    finalResult.metadata = {
      visual_analysis: visualAnalysisState,
      frames_processed: frames.length,
      transcript_length: transcriptText.length,
      processing_time_seconds: elapsedTimeSeconds
    };

    console.log(`[Job ${jobId}] Job completed successfully in ${elapsedTimeSeconds} seconds.`);
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      current_step: 'Completed',
      result: finalResult,
      error: null
    });

  } catch (err) {
    console.error(`[Job ${jobId}] Failed:`, err.message);
    
    let errorMessage = err.message;
    if (errorMessage.toLowerCase().includes("not a bot") || errorMessage.toLowerCase().includes("sign in to confirm")) {
      errorMessage = `YouTube blocked this request with bot detection ("Sign in to confirm you're not a bot"). To fix this on Render, please export your YouTube cookies to Netscape format, base64 encode the file content, and set it as the 'YOUTUBE_COOKIES_BASE64' environment variable in your Render dashboard, then restart/redeploy the service.`;
    }
    
    await updateJob(jobId, {
      status: 'failed',
      error: errorMessage,
      current_step: 'Failed'
    });
  } finally {
    // Always clean up download and transcode frames folders to conserve Render disk space
    console.log(`[Job ${jobId}] Cleaning up temporary folders...`);
    cleanupPath(tempDir);
  }
}

module.exports = {
  runPipeline
};

// server.js - Express web server entry point
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { rateLimit } = require('express-rate-limit');

// Load environment variables
dotenv.config();

const { createJob, getJob, checkCache, cleanOldJobs } = require('./src/supabase');
const { runPipeline } = require('./src/pipeline');
const { extractVideoId, estimateTimeRemaining } = require('./src/utils');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Serve static frontend assets from the public/ directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter: Quiz/Notes generation endpoints (20 requests per 15 mins per IP)
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' }
});

// Rate Limiter: Job status polling endpoint (120 requests per 15 mins per IP)
const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many status check requests from this IP. Please try again after 15 minutes.' }
});

/**
 * Endpoint: Generate Quiz (POST /api/generate-quiz)
 */
app.post('/api/generate-quiz', generateLimiter, async (req, res) => {
  try {
    const { url } = req.body; // Remove user model input
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }

    // Run automatic old jobs cleanup in the background to prevent DB bloat
    cleanOldJobs().catch(err => console.error('Background cleanup error:', err.message));

    // Check Cache: Has this URL + Job Type already been processed in the last 7 days?
    console.log(`Checking quiz cache for url: ${url}`);
    const cachedQuiz = await checkCache(url, 'quiz');
    
    if (cachedQuiz) {
      console.log(`Cache hit for quiz: ${url}`);
      return res.json({
        success: true,
        cached: true,
        videoId,
        quiz: cachedQuiz
      });
    }

    // Cache Miss: Create a new background processing job
    console.log(`Cache miss. Initializing quiz generation job for ${url}`);
    const job = await createJob(url, 'quiz');
    
    // Run the pipeline asynchronously in the background using central config models
    runPipeline(job.id, url, 'quiz').catch(err => {
      console.error(`Background job ${job.id} failed:`, err.message);
    });

    res.json({
      success: true,
      cached: false,
      jobId: job.id,
      videoId
    });

  } catch (error) {
    console.error('Generate quiz endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Generate Notes (POST /api/generate-notes)
 */
app.post('/api/generate-notes', generateLimiter, async (req, res) => {
  try {
    const { url } = req.body; // Remove user model input
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }

    // Run automatic old jobs cleanup in the background to prevent DB bloat
    cleanOldJobs().catch(err => console.error('Background cleanup error:', err.message));

    // Check Cache: Has this URL + Job Type already been processed in the last 7 days?
    console.log(`Checking notes cache for url: ${url}`);
    const cachedNotes = await checkCache(url, 'notes');
    
    if (cachedNotes) {
      console.log(`Cache hit for notes: ${url}`);
      return res.json({
        success: true,
        cached: true,
        videoId,
        notes: cachedNotes
      });
    }

    // Cache Miss: Create a new background processing job
    console.log(`Cache miss. Initializing notes generation job for ${url}`);
    const job = await createJob(url, 'notes');
    
    // Run the pipeline asynchronously in the background using central config models
    runPipeline(job.id, url, 'notes').catch(err => {
      console.error(`Background job ${job.id} failed:`, err.message);
    });

    res.json({
      success: true,
      cached: false,
      jobId: job.id,
      videoId
    });

  } catch (error) {
    console.error('Generate notes endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Job Status Polling (GET /api/job-status/:jobId)
 */
app.get('/api/job-status/:jobId', statusLimiter, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Calculate time remaining estimation dynamically
    let estimatedTimeRemaining = 'Calculating...';
    if (job.status === 'processing') {
      const elapsedMs = Date.now() - new Date(job.created_at).getTime();
      estimatedTimeRemaining = estimateTimeRemaining(elapsedMs, job.progress);
    } else if (job.status === 'completed') {
      estimatedTimeRemaining = '0 seconds';
    } else if (job.status === 'failed') {
      estimatedTimeRemaining = 'None (Failed)';
    }

    res.json({
      status: job.status,
      progress: job.progress,
      current_step: job.current_step,
      estimated_time_remaining: estimatedTimeRemaining,
      result: job.result,
      error: job.error
    });

  } catch (error) {
    console.error('Job status polling endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 QuizTube AI Express Server running on port ${PORT}`);
});

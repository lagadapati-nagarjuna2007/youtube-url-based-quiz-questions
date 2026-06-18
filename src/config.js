// src/config.js - Centralized configuration settings for QuizTube AI

module.exports = {
  // Video validation limits
  MAX_VIDEO_DURATION_SECONDS: 2700, // 45 minutes
  
  // Cache and database clean-up settings
  CACHE_EXPIRY_DAYS: 7,
  CLEANUP_INTERVAL_DAYS: 7,
  
  // Video download quality (maximum 480p for optimal OCR clarity and performance)
  DOWNLOAD_QUALITY: 'best[height<=480][ext=mp4]/mp4',
  
  // Frame extraction & scene change detection settings
  FRAME_SAMPLING_RATE: '1/5',      // Sample 1 frame every 5 seconds
  FFMPEG_SCENE_THRESHOLD: 0.03,    // Difference score threshold for scene cuts (0.0 to 1.0)
  FRAME_BATCH_SIZE: 5,             // Group 5 frames per call to NVIDIA NIM
  
  // AI Model Configurations
  WHISPER_MODEL: 'whisper-large-v3',
  
  // NVIDIA NIM Vision Models
  PRIMARY_VISION_MODEL: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  FALLBACK_VISION_MODEL: 'meta/llama-3.2-11b-vision-instruct',
  
  // Default Groq Reasoning Models
  DEFAULT_REASONING_MODEL: 'llama-3.3-70b-versatile',
  FALLBACK_REASONING_MODEL: 'llama-3.3-70b-specdec'
};

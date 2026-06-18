// src/utils.js - Shared backend helper functions
const fs = require('fs');
const path = require('path');

/**
 * Extracts the 11-character YouTube video ID from a URL
 * @param {string} url 
 * @returns {string|null}
 */
function extractVideoId(url) {
  if (!url) return null;
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

/**
 * Ensures a directory exists, creating it recursively if needed
 * @param {string} dirPath 
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Recursively deletes a directory or file if it exists
 * @param {string} targetPath 
 */
function cleanupPath(targetPath) {
  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Error cleaning up path ${targetPath}:`, err.message);
  }
}

/**
 * Estimates the time remaining for a job based on progress and elapsed time
 * @param {number} elapsedMs - Time elapsed since job started
 * @param {number} progress - Progress percentage (0 to 100)
 * @returns {string} - Human-readable time estimation
 */
function estimateTimeRemaining(elapsedMs, progress) {
  if (!progress || progress <= 0) return 'Calculating...';
  if (progress <= 10) return '3 minutes remaining';
  
  const totalEstimatedMs = (elapsedMs / progress) * 100;
  const remainingMs = totalEstimatedMs - elapsedMs;
  
  if (remainingMs <= 0) return 'Few seconds remaining';
  
  const totalSeconds = Math.round(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes === 0) {
    return `${seconds} seconds remaining`;
  }
  
  if (seconds === 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
  }
  
  return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds} second${seconds > 1 ? 's' : ''} remaining`;
}

module.exports = {
  extractVideoId,
  ensureDirectoryExists,
  cleanupPath,
  estimateTimeRemaining
};

// src/supabase.js - Supabase client configuration and database operations
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables. Database operations will fail.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Creates a new tracking job in Supabase
 * @param {string} youtubeUrl 
 * @param {string} jobType - 'quiz' or 'notes'
 * @returns {Promise<object>} - The created job object
 */
async function createJob(youtubeUrl, jobType) {
  const { data, error } = await supabase
    .from('jobs')
    .insert([
      {
        youtube_url: youtubeUrl,
        job_type: jobType,
        status: 'pending',
        progress: 0,
        current_step: 'Initializing'
      }
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create job in Supabase: ${error.message}`);
  }
  return data;
}

/**
 * Updates a job record
 * @param {string} jobId 
 * @param {object} updates - Column-value updates (e.g. { progress, status, current_step })
 */
async function updateJob(jobId, updates) {
  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    console.error(`Error updating job ${jobId}:`, error.message);
  }
  return data;
}

/**
 * Fetches status of a job
 * @param {string} jobId 
 * @returns {Promise<object>}
 */
async function getJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job: ${error.message}`);
  }
  return data;
}

/**
 * Checks for a cached completed result for the same URL and job type in the last 7 days
 * @param {string} youtubeUrl 
 * @param {string} jobType 
 * @returns {Promise<object|null>} - Returns the cached result object, or null
 */
async function checkCache(youtubeUrl, jobType) {
  const sevenDaysAgo = new Date(Date.now() - config.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('jobs')
    .select('result')
    .eq('youtube_url', youtubeUrl)
    .eq('job_type', jobType)
    .eq('status', 'completed')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error checking cache in Supabase:', error.message);
    return null;
  }
  
  return data ? data.result : null;
}

/**
 * Deletes all jobs (completed/failed/old) older than 7 days to prevent database bloat
 */
async function cleanOldJobs() {
  try {
    const sevenDaysAgo = new Date(Date.now() - config.CLEANUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('jobs')
      .delete()
      .lt('created_at', sevenDaysAgo);

    if (error) {
      console.error('Error running Supabase database cleanup:', error.message);
    } else {
      console.log('🧹 Automatic database cleanup completed successfully.');
    }
  } catch (err) {
    console.error('Exception during database cleanup:', err.message);
  }
}

module.exports = {
  supabase,
  createJob,
  updateJob,
  getJob,
  checkCache,
  cleanOldJobs
};

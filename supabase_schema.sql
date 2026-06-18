-- Supabase Database Schema for QuizTube AI (Version 1 MVP)
-- Copy and run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

-- Create the jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url TEXT NOT NULL,
    job_type VARCHAR(50) NOT NULL, -- 'quiz' or 'notes'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    progress INTEGER NOT NULL DEFAULT 0, -- 0 to 100
    current_step TEXT, -- E.g. 'Extracting video frames'
    result JSONB, -- Final structured JSON output (contains notes, quiz, timeline, and debug metadata)
    error TEXT, -- Error message if status is 'failed'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (Row Level Security) if desired, or leave it disabled for server-to-server operations.
-- Since the Render backend communicates using the Service Role/Anon key, RLS is optional for MVP, 
-- but if you enable it, ensure service_role has access to insert/update/select.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service_role / authenticated server access
CREATE POLICY "Allow server-to-server CRUD" ON jobs 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Trigger to automatically update the updated_at column on changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it already exists
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;

-- Create trigger
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE cv_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_cv_url TEXT NOT NULL,
    job_spec_text TEXT,
    tailored_cv TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cv_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON cv_submissions FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert access for anon and authenticated users" ON cv_submissions FOR INSERT WITH CHECK (TRUE);

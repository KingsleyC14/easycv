require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
const { generateText } = require('ai');

const app = express();
const port = process.env.PORT || 5000;

// Supabase Client
const supabaseProjectUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseProjectUrl, supabaseAnonKey);

// OpenRouter Client
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('EasyCV Backend is running!');
});

// API Endpoints

// Endpoint to upload CV and Job Spec
app.post('/upload', upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'job_spec', maxCount: 1 }]), async (req, res) => {
  try {
    const { cv, job_spec } = req.files;
    const { job_spec_text_input } = req.body; // For direct text input of job spec

    if (!cv || cv.length === 0) {
      return res.status(400).json({ error: 'CV file is required.' });
    }

    // Upload CV to Supabase Storage
    const cvFileName = `cvs/${Date.now()}-${cv[0].originalname}`;
    const { data: cvUploadData, error: cvUploadError } = await supabase.storage
      .from('easycv-files') // Create this bucket in Supabase Storage
      .upload(cvFileName, cv[0].buffer, { contentType: cv[0].mimetype });

    if (cvUploadError) {
      console.error('Error uploading CV:', cvUploadError);
      return res.status(500).json({ error: 'Failed to upload CV.' });
    }
    const { data: { publicUrl: original_cv_url } } = supabase.storage.from('easycv-files').getPublicUrl(cvFileName);

    let job_spec_content = job_spec_text_input;
    let job_spec_url = null;

    if (job_spec && job_spec.length > 0) {
      // Upload Job Spec to Supabase Storage
      const jobSpecFileName = `job_specs/${Date.now()}-${job_spec[0].originalname}`;
      const { data: jobSpecUploadData, error: jobSpecUploadError } = await supabase.storage
        .from('easycv-files')
        .upload(jobSpecFileName, job_spec[0].buffer, { contentType: job_spec[0].mimetype });

      if (jobSpecUploadError) {
        console.error('Error uploading job spec:', jobSpecUploadError);
        return res.status(500).json({ error: 'Failed to upload job spec.' });
      }
      const { data: { publicUrl: job_spec_url_data } } = supabase.storage.from('easycv-files').getPublicUrl(jobSpecFileName);
      job_spec_url = job_spec_url_data;

      // TODO: Implement OCR for image files here if job_spec is an image
      // For now, we'll assume text or docx can be parsed later or directly from input
      job_spec_content = job_spec[0].buffer.toString(); // Simple conversion, will need more robust parsing
    }

    // Insert submission into database
    const { data, error } = await supabase
      .from('cv_submissions')
      .insert({
        original_cv_url,
        job_spec_text: job_spec_content,
        status: 'uploaded',
      })
      .select();

    if (error) {
      console.error('Error inserting into DB:', error);
      return res.status(500).json({ error: 'Failed to save submission.' });
    }

    res.status(200).json({ message: 'Files uploaded and submission created successfully!', data });
  } catch (error) {
    console.error('Server error during upload:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint to tailor CV
app.post('/tailor-cv', async (req, res) => {
  const { submissionId, originalCvContent, jobSpecContent } = req.body;

  if (!submissionId || !originalCvContent || !jobSpecContent) {
    return res.status(400).json({ error: 'Missing required fields for CV tailoring.' });
  }

  try {
    // Basic prompt for OpenRouter
    const prompt = `Tailor the following CV to the given job specification. Ensure the tailored CV highlights relevant skills and experiences. \n\nOriginal CV:\n${originalCvContent}\n\nJob Specification:\n${jobSpecContent}\n\nTailored CV:`;

    const { text } = await generateText({
      model: openrouter('openai/gpt-3.5-turbo'), // Changed to OpenAI GPT-3.5 Turbo via OpenRouter
      prompt: prompt,
      max_tokens: 1500, // Adjust as needed
    });

    const tailoredCv = text;

    // Update the database with the tailored CV and status
    const { data, error } = await supabase
      .from('cv_submissions')
      .update({ tailored_cv: tailoredCv, status: 'tailored' })
      .eq('id', submissionId)
      .select();

    if (error) {
      console.error('Error updating tailored CV in DB:', error);
      return res.status(500).json({ error: 'Failed to save tailored CV.' });
    }

    res.status(200).json({ message: 'CV tailored successfully!', tailoredCv: tailoredCv, data });
  } catch (error) {
    console.error('Error tailoring CV with OpenRouter:', error);
    res.status(500).json({ error: 'Failed to tailor CV.' });
  }
});

// Add a route to fetch a submission by ID for display
app.get('/submission/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('cv_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching submission:', error);
      return res.status(500).json({ error: 'Failed to fetch submission.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Server error fetching submission:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
const { generateText } = require('ai');
const puppeteer = require('puppeteer'); // New import for PDF generation
const pdfParse = require('pdf-parse'); // New import
const mammoth = require('mammoth');   // New import
const fs = require('fs').promises; // New import for file system operations
const Handlebars = require('handlebars'); // New import for templating
const path = require('path'); // New import for path operations

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

// Basic CV Template (now describes desired JSON output structure for AI)
const cvTemplateJSONStructure = {
    full_name: "[Full Name]",
    email: "[Email]",
    phone_number: "[Phone Number]",
    linkedin_url: "[LinkedIn Profile URL (Optional)]",
    portfolio_github_url: "[Portfolio/GitHub URL (Optional)]",
    address: "[Address]",
    summary: "[A concise, tailored summary]",
    experience: [
        {
            job_title: "[Job Title]",
            company_name: "[Company Name]",
            start_date: "[Start Date]",
            end_date: "[End Date]",
            location: "[Location (City, State/Country, Optional)]",
            achievements: [
                "[Achievement 1]",
                "[Achievement 2]"
            ]
        }
    ],
    education: [
        {
            degree_name: "[Degree Name]",
            university_name: "[University Name]",
            location: "[Location]",
            start_date: "[Start Date]",
            end_date: "[End Date]",
            details: [
                "[Relevant Coursework (Optional)]",
                "[Awards/Honors (Optional)]"
            ]
        }
    ],
    technical_skills: "[List of technical skills, comma-separated]",
    soft_skills: "[List of soft skills, comma-separated]"
};

// Helper function to parse PDF content
async function parsePdf(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return null;
  }
}

// Helper function to parse DOCX content
async function parseDocx(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    return value;
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    return null;
  }
}

// API Endpoints

// Endpoint to upload CV and Job Spec
app.post('/upload', upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'job_spec', maxCount: 1 }]), async (req, res) => {
  try {
    const { cv, job_spec } = req.files;
    const { job_spec_text_input } = req.body; // For direct text input of job spec

    if (!cv || cv.length === 0) {
      return res.status(400).json({ error: 'CV file is required.' });
    }

    let original_cv_text = null;
    if (cv[0].mimetype === 'application/pdf') {
      original_cv_text = await parsePdf(cv[0].buffer);
    } else if (cv[0].mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      original_cv_text = await parseDocx(cv[0].buffer);
    } else {
      // Fallback for other text-based files if needed, or return an error
      original_cv_text = cv[0].buffer.toString('utf8');
    }

    if (original_cv_text === null) {
      return res.status(400).json({ error: 'Unsupported CV file format or parsing failed.' });
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
    let job_spec_file_text = null; // New variable for extracted job spec text

    if (job_spec && job_spec.length > 0) {
      // Determine job spec content based on file type or text input
      if (job_spec[0].mimetype === 'application/pdf') {
        job_spec_file_text = await parsePdf(job_spec[0].buffer);
      } else if (job_spec[0].mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        job_spec_file_text = await parseDocx(job_spec[0].buffer);
      } else {
        // Fallback for other text-based files or direct content
        job_spec_file_text = job_spec[0].buffer.toString('utf8');
      }

      if (job_spec_file_text === null) {
        return res.status(400).json({ error: 'Unsupported Job Spec file format or parsing failed.' });
      }

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
    }

    // Insert submission into database
    const { data, error } = await supabase
      .from('cv_submissions')
      .insert({
        original_cv_url,
        original_cv_text, // Save extracted CV text
        job_spec_text: job_spec_content || job_spec_file_text, // Use text input or extracted file text
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
  const { submissionId } = req.body;

  if (!submissionId) {
    return res.status(400).json({ error: 'Missing submissionId for CV tailoring.' });
  }

  try {
    // Fetch the stored original CV text and job spec text from the database
    const { data: submissionData, error: fetchError } = await supabase
      .from('cv_submissions')
      .select('original_cv_text, job_spec_text')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submissionData) {
      console.error('Error fetching submission data:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch submission data for tailoring.' });
    }

    const originalCvContent = submissionData.original_cv_text;
    const jobSpecContent = submissionData.job_spec_text;

    if (!originalCvContent || !jobSpecContent) {
      return res.status(400).json({ error: 'Missing original CV content or job spec content in database for tailoring.' });
    }

    // Prompt for OpenRouter using the defined template
    const prompt = `**ABSOLUTELY CRITICAL: Your top priority is to make this CV match the Job Specification as closely as possible. Every sentence and phrase should be rephrased to align perfectly with the tone, keywords, and requirements of the Job Specification, using its exact language where appropriate. Focus intensely on relevance and direct keyword integration.**

**LINGUISTIC ALIGNMENT DIRECTIVES:**
1. **Vocabulary Mirroring:** Use the EXACT same technical terms, industry jargon, and key phrases found in the Job Specification. Do not paraphrase or use synonyms - adopt the precise terminology.
2. **Tone Matching:** Match the formality level, writing style, and overall tone of the Job Specification. If the job spec uses active voice, use active voice. If it uses specific adjectives to describe requirements, use those same adjectives.
3. **Sentence Structure:** Where possible, mirror the sentence structures and patterns used in the Job Specification, especially for describing responsibilities and requirements.
4. **Keyword Density:** Ensure high keyword density by incorporating multiple relevant terms from the Job Specification into each relevant section, particularly the Summary and Experience sections.
5. **Direct Phrase Adoption:** When the Job Specification uses specific phrases to describe requirements or responsibilities, use those exact phrases in your CV where applicable.

You are a professional CV tailoring assistant. Your overarching goal is to create a CV that feels like it was written *specifically* for the provided Job Specification. This means actively pulling keywords, phrases, and the overall tone from the Job Specification and integrating them into the adapted content from the Original CV. Your output MUST be a JSON object that strictly adheres to the provided 'CV Template JSON Structure' and contains NO other text, comments, or explanations outside the JSON. Ensure all fields are filled based on the tailoring instructions below. If a field is not present in the original CV and cannot be inferred or tailored, leave its value as an empty string or an empty array.

**Instructions for Section Identification & Tailoring:**
1.  **Overall Output Format:** Your final output must be a valid JSON object matching the \`cvTemplateJSONStructure\` exactly.
2.  **Summary:** Rewrite the 'Professional Summary' from the Original CV (or its equivalent introductory section) to be a concise, impactful statement (3-5 sentences) that highlights the candidate's real strengths, experience, and career goals. Use a natural, authentic tone. Only use job spec keywords if they genuinely fit the candidate's background. Do not simply echo or paraphrase the job spec. The summary should feel personal and true to the candidate, while still being relevant to the job.
3.  **Experience:** You **MUST** extract and include **EVERY SINGLE PROFESSIONAL EXPERIENCE ENTRY** from the Original CV (or its equivalent section like 'Work History', 'Professional Background', 'Projects'). **Do NOT change job titles, company names, or invent new roles.** For EACH job entry, THOROUGHLY REWRITE the bullet points and descriptions to highlight relevance to the job spec, but always stay true to the original experience. Do NOT merely copy-paste. Your primary task is to adapt and rephrase bullet points to emphasize achievements, responsibilities, and transferable skills that align with the job requirements, but only use job spec keywords and language where they genuinely apply. Quantify results using metrics (e.g., numbers, percentages, financial impact) whenever possible. If an experience point is not directly relevant, rephrase it to highlight transferable skills (e.g., project management, teamwork, problem-solving, communication, customer service, leadership, data analysis) that are universally valuable in a professional context. Do NOT invent new job roles or responsibilities not present in the Original CV; only adapt what's already there. **When rewriting, imagine you are the hiring manager and rephrase your existing experience to address the job spec, but always preserve the authenticity and factual accuracy of the candidate's history.**
4.  **Education:** Extract and present your educational background from the Original CV (or its equivalent section). Adapt wording if necessary to align with professional tone, but do not alter factual information.
5.  **Skills:** Review all relevant skills sections from the Original CV (e.g., 'Skills', 'Technical Skills', 'Core Competencies', 'Abilities'). Actively select and list ONLY those skills that are directly relevant and explicitly mentioned or strongly implied by the Job Specification. For technical skills, use precise terminology. For soft skills, articulate them in a way that resonates with the job description. Ensure strong alignment with the language used in the Job Specification. Do NOT include any skills that are not present in your Original CV. **Prioritize skills that are explicitly stated or strongly implied as essential in the Job Specification, and use the Job Specification's phrasing for these skills where possible, but do not invent or exaggerate.**

Original CV:
${originalCvContent}

Job Specification:
${jobSpecContent}

CV Template JSON Structure:
${JSON.stringify(cvTemplateJSONStructure, null, 2)}

Tailored CV (JSON output ONLY):`;

    console.log("Content sent to AI:");
    console.log("Original CV Content (from DB):", originalCvContent);
    console.log("Job Spec Content (from DB):", jobSpecContent);

    const { text: tailoredCvJsonString } = await generateText({
      model: openrouter('anthropic/claude-3-opus'), // Switched to Claude 3 Opus for better tailoring
      prompt: prompt,
      max_tokens: 2000, // Increased max_tokens to accommodate detailed CVs
    });

    console.log("Raw Tailored CV JSON String from AI:", tailoredCvJsonString);

    let tailoredCvData;
    try {
        tailoredCvData = JSON.parse(tailoredCvJsonString);
        console.log("Parsed Tailored CV Data (JavaScript Object):");
        console.log(tailoredCvData); // Log the parsed object
    } catch (parseError) {
        console.error('Error parsing tailored CV JSON from AI:', parseError);
        console.error('AI Output that failed to parse:', tailoredCvJsonString);
        return res.status(500).json({ error: 'Failed to parse AI-generated CV content.' });
    }

    // Ensure skills are arrays for bullet point rendering
    if (typeof tailoredCvData.technical_skills === 'string') {
        tailoredCvData.technical_skills = tailoredCvData.technical_skills
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }
    if (typeof tailoredCvData.soft_skills === 'string') {
        tailoredCvData.soft_skills = tailoredCvData.soft_skills
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    // Read the HTML template file
    const htmlTemplatePath = path.join(__dirname, 'cv_template.html');
    const htmlTemplate = await fs.readFile(htmlTemplatePath, 'utf8');

    // Compile the Handlebars template
    const template = Handlebars.compile(htmlTemplate);

    // Render the HTML with the tailored CV data
    const renderedHtml = template(tailoredCvData);
    console.log("Rendered HTML (before PDF generation):");
    console.log(renderedHtml); // Log the rendered HTML

    // Generate PDF from the rendered HTML
    const browser = await puppeteer.launch({
        headless: true, // Use headless mode for production
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(renderedHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Send the PDF as a file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=tailored_cv.pdf');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Server error during CV tailoring or PDF generation:', error);
    res.status(500).json({ error: 'Internal server error.' });
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
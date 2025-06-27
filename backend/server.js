require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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

// Import security middleware
const { validateEnvironment, config } = require('./middleware/config');
const { logger, requestLogger, errorLogger, securityLogger } = require('./middleware/logger');
const {
  uploadLimiter,
  tailorLimiter,
  fileFilter,
  fileSizeLimits,
  validateUpload,
  validateTailorCv,
  handleValidationErrors,
  errorHandler,
  sanitizeRequest
} = require('./middleware/security');

// Import scalability middleware
const { cacheMiddleware, cacheUtils, checkRedisHealth } = require('./middleware/cache');
const { supabase, dbUtils, dbMetrics, dbMiddleware } = require('./middleware/database');
const { queueUtils, gracefulShutdown: queueShutdown } = require('./middleware/queue');
const { 
  healthCheckMiddleware, 
  healthEndpoints, 
  scheduleHealthChecks 
} = require('./middleware/health');

// Validate environment variables before starting
try {
  validateEnvironment();
} catch (error) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

const app = express();
const port = config.port;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow PDF generation
}));

// CORS configuration
app.use(cors({
  origin: config.security.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(requestLogger);

// Health check middleware
app.use(healthCheckMiddleware);

// Database middleware
app.use(dbMiddleware);

// Request sanitization
app.use(sanitizeRequest);

// Multer configuration with security
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: Math.max(fileSizeLimits.cv, fileSizeLimits.job_spec),
    files: 2, // Maximum 2 files (cv + job_spec)
  }
});

// OpenRouter Client
const openrouter = createOpenRouter({
  apiKey: config.openrouter.apiKey,
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
    logger.error('Error parsing PDF:', { error: error.message });
    return null;
  }
}

// Helper function to parse DOCX content
async function parseDocx(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    return value;
  } catch (error) {
    logger.error('Error parsing DOCX:', { error: error.message });
    return null;
  }
}

// Health check endpoints
app.get('/health', healthEndpoints.basic);
app.get('/health/database', healthEndpoints.database);
app.get('/health/redis', healthEndpoints.redis);
app.get('/health/queue', healthEndpoints.queue);
app.get('/health/system', healthEndpoints.system);
app.get('/health/comprehensive', healthEndpoints.comprehensive);
app.get('/metrics', healthEndpoints.metrics);

// Enhanced health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'EasyCV Backend is running!',
    version: '1.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    worker: process.pid
  });
});

// API Endpoints

// Endpoint to upload CV and Job Spec
app.post('/upload', 
  uploadLimiter,
  upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'job_spec', maxCount: 1 }]),
  validateUpload,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { cv, job_spec } = req.files;
      const { job_spec_text_input } = req.body;

      if (!cv || cv.length === 0) {
        securityLogger.failedUpload(req, 'CV file missing');
        return res.status(400).json({ error: 'CV file is required.' });
      }

      // Validate CV file size
      if (cv[0].size > fileSizeLimits.cv) {
        securityLogger.failedUpload(req, 'CV file too large');
        return res.status(400).json({ 
          error: 'CV file too large.',
          details: `Maximum size: ${fileSizeLimits.cv / (1024 * 1024)}MB`
        });
      }

      let original_cv_text = null;
      if (cv[0].mimetype === 'application/pdf') {
        original_cv_text = await parsePdf(cv[0].buffer);
      } else if (cv[0].mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        original_cv_text = await parseDocx(cv[0].buffer);
      } else {
        original_cv_text = cv[0].buffer.toString('utf8');
      }

      if (original_cv_text === null) {
        securityLogger.failedUpload(req, 'CV parsing failed');
        return res.status(400).json({ error: 'Unsupported CV file format or parsing failed.' });
      }

      // Upload CV to Supabase Storage with retry
      const cvFileName = `cvs/${Date.now()}-${cv[0].originalname}`;
      const cvUploadData = await dbUtils.uploadFileWithRetry(
        config.upload.storageBucket,
        cvFileName,
        cv[0].buffer,
        cv[0].mimetype
      );

      const original_cv_url = await dbUtils.getFileUrl(config.upload.storageBucket, cvFileName);

      let job_spec_content = job_spec_text_input;
      let job_spec_file_text = null;

      if (job_spec && job_spec.length > 0) {
        // Validate job spec file size
        if (job_spec[0].size > fileSizeLimits.job_spec) {
          securityLogger.failedUpload(req, 'Job spec file too large');
          return res.status(400).json({ 
            error: 'Job spec file too large.',
            details: `Maximum size: ${fileSizeLimits.job_spec / (1024 * 1024)}MB`
          });
        }

        if (job_spec[0].mimetype === 'application/pdf') {
          job_spec_file_text = await parsePdf(job_spec[0].buffer);
        } else if (job_spec[0].mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          job_spec_file_text = await parseDocx(job_spec[0].buffer);
        } else {
          job_spec_file_text = job_spec[0].buffer.toString('utf8');
        }

        if (job_spec_file_text === null) {
          securityLogger.failedUpload(req, 'Job spec parsing failed');
          return res.status(400).json({ error: 'Unsupported Job Spec file format or parsing failed.' });
        }

        // Upload Job Spec to Supabase Storage with retry
        const jobSpecFileName = `job_specs/${Date.now()}-${job_spec[0].originalname}`;
        await dbUtils.uploadFileWithRetry(
          config.upload.storageBucket,
          jobSpecFileName,
          job_spec[0].buffer,
          job_spec[0].mimetype
        );
      }

      // Insert submission into database with timeout
      const submissionData = await dbUtils.queryWithTimeout(async () => {
        const { data, error } = await supabase
          .from('cv_submissions')
          .insert({
            original_cv_url,
            original_cv_text,
            job_spec_text: job_spec_content || job_spec_file_text,
            status: 'uploaded',
          })
          .select();

        if (error) throw error;
        return data;
      });

      // Cache submission data
      await cacheUtils.cacheSubmission(submissionData[0].id, submissionData[0]);

      logger.info('File upload successful', { 
        submissionId: submissionData[0].id,
        ip: req.ip,
        fileTypes: {
          cv: cv[0].mimetype,
          jobSpec: job_spec ? job_spec[0].mimetype : 'text'
        }
      });

      res.status(200).json({ message: 'Files uploaded and submission created successfully!', data: submissionData });
    } catch (error) {
      logger.error('Server error during upload:', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// Endpoint to tailor CV
app.post('/tailor-cv',
  tailorLimiter,
  validateTailorCv,
  handleValidationErrors,
  async (req, res) => {
    const { submissionId } = req.body;

    try {
      // Try to get from cache first
      let submissionData = await cacheUtils.getSubmission(submissionId);
      
      if (!submissionData) {
        // Fetch from database with timeout
        submissionData = await dbUtils.queryWithTimeout(async () => {
          const { data, error } = await supabase
            .from('cv_submissions')
            .select('original_cv_text, job_spec_text')
            .eq('id', submissionId)
            .single();

          if (error) throw error;
          return data;
        });

        // Cache the result
        await cacheUtils.cacheSubmission(submissionId, submissionData);
      }

      const originalCvContent = submissionData.original_cv_text;
      const jobSpecContent = submissionData.job_spec_text;

      if (!originalCvContent || !jobSpecContent) {
        return res.status(400).json({ error: 'Missing original CV content or job spec content in database for tailoring.' });
      }

      // Add to processing queue for better scalability
      const job = await queueUtils.addCvProcessingJob(submissionId, originalCvContent, jobSpecContent);

      // Generate the prompt with an explicit instruction for valid JSON
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

IMPORTANT: Your output MUST be a single, complete, valid JSON object matching the provided structure. Do NOT include any extra text, comments, or explanations. Do NOT cut off the JSON. If you cannot fill a field, use an empty string or array.

Original CV:
${originalCvContent}

Job Specification:
${jobSpecContent}

CV Template JSON Structure:
${JSON.stringify(cvTemplateJSONStructure, null, 2)}

Tailored CV (JSON output ONLY):`;

      logger.info('Starting CV tailoring', { submissionId, ip: req.ip, jobId: job.id });

      let tailoredCvData = null;
      let lastAiOutput = '';
      let aiError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { text: tailoredCvJsonString } = await generateText({
          model: openrouter('anthropic/claude-3-opus'),
          prompt: prompt,
          max_tokens: 1800,
        });
        lastAiOutput = tailoredCvJsonString;
        try {
          tailoredCvData = JSON.parse(tailoredCvJsonString);
          aiError = null;
          break;
        } catch (parseError) {
          aiError = parseError;
          logger.error('AI output not valid JSON', {
            error: parseError.message,
            submissionId,
            attempt,
            aiOutput: tailoredCvJsonString.substring(0, 1000) // Log first 1000 chars
          });
        }
      }
      if (!tailoredCvData) {
        logger.error('Failed to get valid JSON from AI after 3 attempts', {
          submissionId,
          lastAiOutput: lastAiOutput.substring(0, 1000),
          aiError: aiError ? aiError.message : undefined
        });
        return res.status(500).json({ error: 'AI failed to generate a valid CV. Please try again.' });
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

      // Generate PDF from the rendered HTML
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        protocolTimeout: 120000
      });
      const page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();

      logger.info('CV tailoring completed successfully', { submissionId, ip: req.ip });

      // Log before sending PDF
      logger.info('Sending tailored PDF response', {
        submissionId,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=tailored_cv.pdf'
        }
      });

      // Send the PDF as a file download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=tailored_cv.pdf');
      res.send(pdfBuffer);

    } catch (error) {
      logger.error('Server error during CV tailoring or PDF generation:', {
        error: error.message,
        stack: error.stack,
        submissionId,
        // If response object exists, log headers and status
        responseHeaders: res.getHeaders ? res.getHeaders() : undefined,
        responseStatus: res.statusCode
      });
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// Add a route to fetch a submission by ID for display (with caching)
app.get('/submission/:id', cacheMiddleware(1800), async (req, res) => {
  const { id } = req.params;
  try {
    // Try cache first
    let data = await cacheUtils.getSubmission(id);
    
    if (!data) {
      // Fetch from database with timeout
      data = await dbUtils.queryWithTimeout(async () => {
        const { data, error } = await supabase
          .from('cv_submissions')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      });

      if (!data) {
        return res.status(404).json({ error: 'Submission not found.' });
      }

      // Cache the result
      await cacheUtils.cacheSubmission(id, data);
    }

    res.status(200).json(data);
  } catch (error) {
    logger.error('Server error fetching submission:', { error: error.message, id });
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Error handling middleware (must be last)
app.use(errorLogger);
app.use(errorHandler);

// Start scheduled health checks
scheduleHealthChecks();

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down server gracefully...');
  
  // Close queues
  await queueShutdown();
  
  // Close database connections
  // (Supabase handles this automatically)
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(port, () => {
  logger.info(`Server started successfully`, { 
    port, 
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    worker: process.pid
  });
}); 
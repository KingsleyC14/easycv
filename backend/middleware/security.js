const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');

// Rate limiting middleware
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests from this IP') => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Specific rate limiters for different endpoints
const uploadLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many upload requests. Please try again later.');
const tailorLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many CV tailoring requests. Please try again later.');

// File upload security configuration
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];

  // Allowed file extensions
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`), false);
  }
};

// File size limits (5MB for CV, 2MB for job spec)
const fileSizeLimits = {
  cv: 5 * 1024 * 1024, // 5MB
  job_spec: 2 * 1024 * 1024 // 2MB
};

// Input validation middleware
const validateUpload = [
  body('job_spec_text_input')
    .optional()
    .isLength({ min: 10, max: 10000 })
    .withMessage('Job specification text must be between 10 and 10,000 characters')
    .trim()
    .escape(),
];

const validateTailorCv = [
  body('submissionId')
    .isUUID()
    .withMessage('Invalid submission ID format'),
];

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large',
      details: 'CV files must be under 5MB, job spec files under 2MB'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Unexpected file field',
      details: 'Only cv and job_spec files are allowed'
    });
  }

  // Handle file type errors
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      details: err.message
    });
  }

  // Generic error response
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Sanitize file names
  if (req.files) {
    Object.keys(req.files).forEach(fieldName => {
      req.files[fieldName].forEach(file => {
        // Remove any path traversal attempts
        file.originalname = path.basename(file.originalname);
        // Remove any potentially dangerous characters
        file.originalname = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '');
      });
    });
  }

  // Sanitize body parameters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  next();
};

module.exports = {
  uploadLimiter,
  tailorLimiter,
  fileFilter,
  fileSizeLimits,
  validateUpload,
  validateTailorCv,
  handleValidationErrors,
  errorHandler,
  sanitizeRequest
}; 
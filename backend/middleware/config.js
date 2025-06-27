// Environment variable validation
const validateEnvironment = () => {
  const requiredVars = [
    'SUPABASE_PROJECT_URL',
    'SUPABASE_ANON_KEY',
    'OPENROUTER_API_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate URL formats
  try {
    new URL(process.env.SUPABASE_PROJECT_URL);
  } catch (error) {
    throw new Error('Invalid SUPABASE_PROJECT_URL format');
  }

  // Validate API key formats (basic checks)
  if (process.env.SUPABASE_ANON_KEY.length < 20) {
    throw new Error('SUPABASE_ANON_KEY appears to be invalid');
  }

  if (process.env.OPENROUTER_API_KEY.length < 20) {
    throw new Error('OPENROUTER_API_KEY appears to be invalid');
  }

  console.log('✅ Environment variables validated successfully');
};

// Configuration object
const config = {
  // Server configuration
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Supabase configuration
  supabase: {
    projectUrl: process.env.SUPABASE_PROJECT_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  
  // OpenRouter configuration
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
  },
  
  // Security configuration
  security: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    maxFileSize: {
      cv: 5 * 1024 * 1024, // 5MB
      jobSpec: 2 * 1024 * 1024, // 2MB
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100, // per window
      uploadMax: 10, // uploads per window
      tailorMax: 5, // tailoring requests per window
    },
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.NODE_ENV !== 'production',
  },
  
  // File upload configuration
  upload: {
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ],
    allowedExtensions: ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'],
    storageBucket: 'easycv-files',
  },
};

module.exports = {
  validateEnvironment,
  config
}; 
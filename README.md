# EasyCV

A secure, production-ready full-stack web application for tailoring CVs to job specifications using OpenRouter (Claude 3 Opus), React, Node.js/Express, and Supabase.

## 🚀 Features

- **AI-Powered CV Tailoring**: Uses Claude 3 Opus via OpenRouter for intelligent CV customization
- **PDF Generation**: Automatically generates professional PDF CVs
- **File Upload Support**: Handles PDF and DOCX files for CVs and job specifications
- **Production-Ready Security**: Comprehensive security measures including rate limiting, input validation, and security headers
- **Structured Logging**: Winston-based logging with security event tracking
- **Docker Support**: Containerized deployment with Docker and Docker Compose
- **Scalable Architecture**: Built for production deployment with monitoring and alerting

## 🛡️ Security Features

- **Input Validation & Sanitization**: All user inputs are validated and sanitized
- **Rate Limiting**: Configurable rate limits for API endpoints and file uploads
- **Security Headers**: Helmet middleware with Content Security Policy
- **File Upload Security**: Strict file type and size validation
- **Error Handling**: Secure error messages that don't expose sensitive information
- **Environment Validation**: Automatic validation of required environment variables
- **Request Sanitization**: Protection against path traversal and malicious inputs

## 📁 Project Structure

```
EasyCV/
├── frontend/                 # React application with Tailwind CSS
├── backend/                  # Node.js/Express server
│   ├── middleware/          # Security and logging middleware
│   ├── logs/               # Application logs (auto-generated)
│   ├── server.js           # Main server file
│   ├── cv_template.html    # PDF template
│   └── Dockerfile          # Production Docker configuration
├── supabase/               # Supabase migrations and schema
├── docker-compose.yml      # Local development setup
├── SECURITY.md             # Security documentation
├── DEPLOYMENT.md           # Production deployment guide
└── PRODUCTION_CHECKLIST.md # Pre-production checklist
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- OpenRouter API key

### 1. Environment Setup

Create a `.env` file in the `backend/` directory:

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Supabase Configuration
SUPABASE_PROJECT_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Logging Configuration
LOG_LEVEL=info
```

### 2. Backend Setup

```bash
cd backend
npm install
npm start
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 4. Supabase Setup

1. **Initialize Supabase:**
   ```bash
   supabase init
   ```

2. **Link to your project:**
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. **Run migrations:**
   ```bash
   supabase db push
   ```

## 🐳 Docker Deployment

### Local Development with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f easycv-backend

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Build and run production container
docker build -t easycv-backend ./backend
docker run -p 5000:5000 --env-file backend/.env easycv-backend
```

## 🔒 Security Configuration

### Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **File Uploads**: 10 uploads per 15 minutes per IP
- **CV Tailoring**: 5 requests per 15 minutes per IP

### File Upload Limits

- **CV Files**: 5MB maximum (PDF, DOCX, DOC)
- **Job Spec Files**: 2MB maximum (PDF, DOCX, DOC, Images)

### Security Headers

- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (HSTS)

## 📊 Monitoring & Logging

### Log Files

- `backend/logs/error.log`: Error-level logs
- `backend/logs/combined.log`: All application logs

### Security Events Logged

- Failed file uploads
- Rate limit violations
- Suspicious activity
- Authentication failures
- File parsing errors

### Health Check

```bash
curl http://localhost:5000/
```

## 🚀 Production Deployment

### Deployment Options

1. **Docker**: Use provided Dockerfile and docker-compose.yml
2. **Vercel**: Serverless deployment with Vercel
3. **Railway**: Easy deployment with Railway
4. **Heroku**: Traditional hosting with Heroku
5. **Self-hosted**: Deploy on your own infrastructure

### Production Checklist

Before deploying to production, review the comprehensive checklist in `PRODUCTION_CHECKLIST.md`:

- [ ] Security measures implemented
- [ ] Environment variables configured
- [ ] Monitoring and logging set up
- [ ] Performance testing completed
- [ ] Compliance requirements met

## 📚 Documentation

- **[Security Documentation](SECURITY.md)**: Comprehensive security guide
- **[Deployment Guide](DEPLOYMENT.md)**: Production deployment instructions
- **[Production Checklist](PRODUCTION_CHECKLIST.md)**: Pre-production verification

## 🗄️ Database Schema

### cv_submissions Table

```sql
CREATE TABLE cv_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_cv_url TEXT NOT NULL,
    original_cv_text TEXT,
    job_spec_text TEXT,
    status TEXT DEFAULT 'uploaded',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔧 API Endpoints

### POST /upload
Upload CV and job specification files.

**Request:**
- `cv`: CV file (PDF, DOCX, DOC)
- `job_spec`: Job specification file (optional)
- `job_spec_text_input`: Job specification text (optional)

**Response:**
```json
{
  "message": "Files uploaded and submission created successfully!",
  "data": [{ "id": "uuid", "status": "uploaded" }]
}
```

### POST /tailor-cv
Generate tailored CV PDF.

**Request:**
```json
{
  "submissionId": "uuid"
}
```

**Response:** PDF file download

### GET /submission/:id
Get submission details.

**Response:**
```json
{
  "id": "uuid",
  "original_cv_url": "url",
  "original_cv_text": "text",
  "job_spec_text": "text",
  "status": "uploaded",
  "created_at": "timestamp"
}
```

## 🛠️ Development

### Running Tests

```bash
# Security tests
cd backend
node test-security.js

# Manual testing
curl -X POST http://localhost:5000/upload \
  -F "cv=@path/to/cv.pdf" \
  -F "job_spec_text_input=Job description here"
```

### Adding New Features

1. Follow security best practices
2. Add input validation for new endpoints
3. Update rate limiting configuration
4. Add comprehensive logging
5. Update documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow security guidelines
4. Add tests for new features
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation in the `/docs` folder
- Review the security documentation
- Open an issue on GitHub

## 🔄 Changelog

### v1.0.0 - Production Release
- ✅ Comprehensive security implementation
- ✅ Production deployment support
- ✅ Docker containerization
- ✅ Structured logging and monitoring
- ✅ Rate limiting and abuse prevention
- ✅ File upload security
- ✅ Input validation and sanitization

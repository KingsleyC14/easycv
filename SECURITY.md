# Security Documentation

## Overview
This document outlines the security measures implemented in the EasyCV application to protect user data and prevent common security vulnerabilities.

## Security Measures Implemented

### 1. Input Validation & Sanitization
- **Express Validator**: All user inputs are validated using express-validator
- **File Upload Validation**: Strict file type and size validation
- **Input Sanitization**: All user inputs are trimmed and sanitized
- **Path Traversal Prevention**: File names are sanitized to prevent directory traversal attacks

### 2. Rate Limiting
- **General Rate Limiting**: 100 requests per 15 minutes per IP
- **Upload Rate Limiting**: 10 upload requests per 15 minutes per IP
- **CV Tailoring Rate Limiting**: 5 tailoring requests per 15 minutes per IP
- **Configurable Limits**: All limits can be adjusted via environment variables

### 3. Security Headers (Helmet)
- **Content Security Policy**: Restricts resource loading to trusted sources
- **XSS Protection**: Prevents cross-site scripting attacks
- **Content Type Sniffing**: Prevents MIME type sniffing attacks
- **Frame Options**: Prevents clickjacking attacks
- **HSTS**: Enforces HTTPS connections

### 4. File Upload Security
- **File Type Validation**: Only allows PDF, DOCX, DOC, and image files
- **File Size Limits**: 
  - CV files: 5MB maximum
  - Job spec files: 2MB maximum
- **MIME Type Validation**: Validates both file extension and MIME type
- **Virus Scanning**: Files are processed in memory only

### 5. CORS Configuration
- **Restricted Origins**: Only allows requests from configured origins
- **Method Restrictions**: Only allows GET and POST methods
- **Header Restrictions**: Only allows necessary headers

### 6. Error Handling & Logging
- **Structured Logging**: All events are logged with Winston
- **Error Sanitization**: Error messages don't expose sensitive information in production
- **Security Event Logging**: Failed uploads, rate limit violations, and suspicious activity are logged
- **Log Rotation**: Logs are automatically rotated to prevent disk space issues

### 7. Environment Variable Security
- **Required Variables**: Application validates all required environment variables on startup
- **Format Validation**: Validates URL formats and API key lengths
- **Secure Storage**: Environment variables are never logged or exposed

### 8. Request Size Limits
- **JSON Payload Limit**: 10MB maximum for JSON requests
- **URL Encoded Limit**: 10MB maximum for form data
- **File Upload Limits**: Enforced at both application and middleware levels

### 9. Database Security
- **Supabase Row Level Security**: Database access is controlled by Supabase RLS policies
- **Connection Security**: All database connections use HTTPS
- **Query Sanitization**: All database queries are parameterized

### 10. API Security
- **Input Validation**: All API endpoints validate input data
- **UUID Validation**: Submission IDs are validated as UUIDs
- **Response Sanitization**: API responses don't expose sensitive information

## Security Configuration

### Environment Variables
```bash
# Required for security
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=warn

# Rate limiting (optional, defaults provided)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_TAILOR_MAX=5
```

### File Upload Limits
- **CV Files**: 5MB maximum
- **Job Spec Files**: 2MB maximum
- **Allowed Types**: PDF, DOCX, DOC, JPG, JPEG, PNG

### Rate Limiting Configuration
- **Window**: 15 minutes
- **General Requests**: 100 per window
- **Uploads**: 10 per window
- **CV Tailoring**: 5 per window

## Security Best Practices

### For Developers
1. **Never commit environment files**: All `.env` files are in `.gitignore`
2. **Use HTTPS in production**: Always use HTTPS for production deployments
3. **Regular security updates**: Keep all dependencies updated
4. **Monitor logs**: Regularly check security logs for suspicious activity

### For Deployment
1. **Use environment variables**: Never hardcode sensitive information
2. **Enable HTTPS**: Use SSL/TLS certificates
3. **Configure CORS properly**: Only allow necessary origins
4. **Set up monitoring**: Monitor for security events and rate limit violations

## Security Monitoring

### Log Files
- `backend/logs/error.log`: Contains all error-level logs
- `backend/logs/combined.log`: Contains all application logs

### Security Events Logged
- Failed file uploads
- Rate limit violations
- Suspicious activity
- Authentication failures (when implemented)
- File parsing errors

### Monitoring Recommendations
1. **Set up log aggregation**: Use tools like ELK stack or Splunk
2. **Configure alerts**: Set up alerts for security events
3. **Regular log review**: Review logs weekly for suspicious activity
4. **Rate limit monitoring**: Monitor rate limit violations

## Incident Response

### Security Incident Types
1. **Rate limit violations**: Monitor for patterns indicating abuse
2. **File upload failures**: Check for malicious file upload attempts
3. **API abuse**: Monitor for unusual API usage patterns
4. **Data breaches**: Monitor for unauthorized data access

### Response Procedures
1. **Immediate**: Block suspicious IPs if necessary
2. **Investigation**: Review logs and identify root cause
3. **Mitigation**: Implement additional security measures if needed
4. **Documentation**: Document incident and response actions

## Compliance

### GDPR Considerations
- **Data Minimization**: Only collect necessary data
- **Data Retention**: Implement data retention policies
- **User Rights**: Implement data export and deletion capabilities
- **Consent**: Obtain proper consent for data processing

### Data Protection
- **Encryption**: All data is encrypted in transit and at rest
- **Access Control**: Implement proper access controls
- **Audit Logging**: Log all data access and modifications
- **Data Backup**: Regular secure backups of user data

## Future Security Enhancements

### Planned Improvements
1. **Authentication & Authorization**: Implement user authentication
2. **API Key Management**: Secure API key storage and rotation
3. **Advanced Rate Limiting**: Implement adaptive rate limiting
4. **Security Headers**: Additional security headers
5. **Input Validation**: Enhanced input validation rules
6. **Monitoring**: Advanced security monitoring and alerting

### Security Testing
1. **Penetration Testing**: Regular security assessments
2. **Vulnerability Scanning**: Automated vulnerability scanning
3. **Code Review**: Security-focused code reviews
4. **Dependency Scanning**: Regular dependency vulnerability checks 
# Production Deployment Guide

## Overview
This guide covers deploying the EasyCV application to production with proper security, monitoring, and scalability considerations.

## Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Set up production environment variables
- [ ] Configure Supabase production project
- [ ] Set up OpenRouter production API key
- [ ] Configure domain and SSL certificates
- [ ] Set up monitoring and logging

### 2. Security Configuration
- [ ] Review and update security headers
- [ ] Configure CORS for production domain
- [ ] Set up rate limiting for production traffic
- [ ] Enable HTTPS enforcement
- [ ] Configure file upload limits

### 3. Database Setup
- [ ] Set up Supabase production project
- [ ] Configure Row Level Security (RLS) policies
- [ ] Set up database backups
- [ ] Configure connection pooling

## Production Environment Variables

Create a `.env` file in the backend directory with the following variables:

```bash
# Server Configuration
PORT=5000
NODE_ENV=production

# Supabase Configuration (Production)
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key

# OpenRouter Configuration (Production)
OPENROUTER_API_KEY=your_production_openrouter_key

# CORS Configuration (Production)
CORS_ORIGIN=https://yourdomain.com

# Logging Configuration
LOG_LEVEL=warn

# Rate Limiting (Production)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_UPLOAD_MAX=10
RATE_LIMIT_TAILOR_MAX=5
```

## Deployment Options

### Option 1: Docker Deployment

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/ || exit 1

# Start application
CMD ["node", "server.js"]
```

#### Docker Compose
```yaml
version: '3.8'

services:
  easycv-backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - easycv-backend
    restart: unless-stopped
```

### Option 2: Cloud Platform Deployment

#### Vercel Deployment
1. Install Vercel CLI: `npm i -g vercel`
2. Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "backend/server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

#### Railway Deployment
1. Connect your GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

#### Heroku Deployment
1. Create `Procfile`:
```
web: node backend/server.js
```
2. Set environment variables in Heroku dashboard
3. Deploy using Heroku CLI or GitHub integration

## Nginx Configuration

Create `nginx.conf` for reverse proxy and SSL termination:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream easycv_backend {
        server easycv-backend:5000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=2r/s;

    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security Headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # File upload limits
        client_max_body_size 10M;

        location / {
            # Rate limiting
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://easycv_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        location /upload {
            # Stricter rate limiting for uploads
            limit_req zone=upload burst=5 nodelay;
            
            proxy_pass http://easycv_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }
    }
}
```

## Monitoring and Logging

### Application Monitoring
1. **Health Checks**: Implement health check endpoints
2. **Metrics Collection**: Use tools like Prometheus + Grafana
3. **Error Tracking**: Set up Sentry for error monitoring
4. **Performance Monitoring**: Use APM tools like New Relic or DataDog

### Log Management
1. **Log Aggregation**: Use ELK stack (Elasticsearch, Logstash, Kibana)
2. **Log Rotation**: Configure log rotation to prevent disk space issues
3. **Security Logs**: Monitor security events and rate limit violations

### Example Monitoring Setup

#### Prometheus Configuration
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'easycv-backend'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
```

#### Grafana Dashboard
Create dashboards for:
- Request rate and response times
- Error rates
- File upload statistics
- Rate limit violations
- System resources (CPU, memory, disk)

## Security Hardening

### 1. Network Security
- Use HTTPS everywhere
- Implement proper firewall rules
- Use VPN for admin access
- Regular security audits

### 2. Application Security
- Regular dependency updates
- Security header configuration
- Input validation and sanitization
- Rate limiting and abuse prevention

### 3. Data Security
- Encrypt data at rest and in transit
- Implement proper access controls
- Regular security backups
- Data retention policies

## Performance Optimization

### 1. Caching
- Implement Redis for session storage
- Cache frequently accessed data
- Use CDN for static assets

### 2. Database Optimization
- Configure connection pooling
- Optimize database queries
- Implement database indexing
- Regular database maintenance

### 3. Application Optimization
- Enable gzip compression
- Optimize file upload handling
- Implement request queuing
- Use load balancing for high traffic

## Backup and Recovery

### 1. Database Backups
- Automated daily backups
- Point-in-time recovery
- Test backup restoration regularly

### 2. Application Backups
- Configuration backups
- Log file backups
- Disaster recovery plan

### 3. Monitoring Backups
- Monitor backup success/failure
- Alert on backup issues
- Regular backup testing

## Scaling Considerations

### 1. Horizontal Scaling
- Load balancer configuration
- Session management
- Database scaling strategies

### 2. Vertical Scaling
- Resource monitoring
- Performance optimization
- Capacity planning

### 3. Auto-scaling
- Cloud provider auto-scaling
- Traffic-based scaling
- Cost optimization

## Maintenance and Updates

### 1. Regular Maintenance
- Security updates
- Dependency updates
- Performance monitoring
- Log analysis

### 2. Deployment Process
- Blue-green deployments
- Rollback procedures
- Zero-downtime deployments
- Testing procedures

### 3. Monitoring and Alerts
- Set up monitoring alerts
- Performance thresholds
- Error rate monitoring
- Resource usage alerts

## Troubleshooting

### Common Issues
1. **Rate Limiting**: Monitor rate limit violations
2. **File Upload Failures**: Check file size and type restrictions
3. **Database Connection Issues**: Monitor connection pool usage
4. **Memory Leaks**: Monitor memory usage patterns

### Debug Procedures
1. Check application logs
2. Monitor system resources
3. Review error tracking
4. Test endpoints manually

## Cost Optimization

### 1. Resource Optimization
- Right-size instances
- Use reserved instances
- Monitor resource usage
- Implement auto-scaling

### 2. API Cost Management
- Monitor OpenRouter usage
- Implement usage limits
- Optimize API calls
- Cache responses when possible

### 3. Storage Optimization
- Implement data retention policies
- Use appropriate storage classes
- Monitor storage usage
- Clean up unused files

## Compliance and Legal

### 1. GDPR Compliance
- Data minimization
- User consent management
- Data export capabilities
- Data deletion procedures

### 2. Privacy Policy
- Clear privacy policy
- Cookie consent
- Data usage transparency
- User rights documentation

### 3. Terms of Service
- Clear terms of service
- Usage limitations
- Liability disclaimers
- Dispute resolution

This deployment guide provides a comprehensive approach to deploying EasyCV in production with proper security, monitoring, and scalability considerations. 
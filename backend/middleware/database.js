const { createClient } = require('@supabase/supabase-js');
const { logger } = require('./logger');

// Database connection pool configuration
const dbConfig = {
  url: process.env.SUPABASE_PROJECT_URL,
  key: process.env.SUPABASE_ANON_KEY,
  options: {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'easycv-backend'
      }
    }
  }
};

// Create Supabase client with connection pooling
const supabase = createClient(dbConfig.url, dbConfig.key, dbConfig.options);

// Database health check
const checkDatabaseHealth = async () => {
  try {
    const start = Date.now();
    const { data, error } = await supabase
      .from('cv_submissions')
      .select('count')
      .limit(1);
    
    const duration = Date.now() - start;
    
    if (error) {
      logger.error('Database health check failed', { error: error.message });
      return { healthy: false, error: error.message };
    }
    
    logger.info('Database health check passed', { duration: `${duration}ms` });
    return { healthy: true, duration };
  } catch (error) {
    logger.error('Database health check error', { error: error.message });
    return { healthy: false, error: error.message };
  }
};

// Database query optimization utilities
const dbUtils = {
  // Optimized query with timeout
  async queryWithTimeout(queryFn, timeoutMs = 10000) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Database query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await queryFn();
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  },

  // Batch operations
  async batchInsert(table, records, batchSize = 100) {
    const batches = [];
    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const { data, error } = await supabase
        .from(table)
        .insert(batch)
        .select();

      if (error) {
        logger.error('Batch insert error', { table, error: error.message });
        throw error;
      }

      results.push(...data);
    }

    return results;
  },

  // Optimized file upload with retry
  async uploadFileWithRetry(bucket, path, file, contentType, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, file, { contentType });

        if (error) {
          throw error;
        }

        logger.info('File upload successful', { bucket, path, attempt });
        return data;
      } catch (error) {
        logger.warn('File upload attempt failed', { 
          bucket, 
          path, 
          attempt, 
          error: error.message 
        });

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  },

  // Get file URL with fallback
  async getFileUrl(bucket, path) {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    } catch (error) {
      logger.error('Error getting file URL', { bucket, path, error: error.message });
      return null;
    }
  },

  // Optimized submission retrieval
  async getSubmissionOptimized(id) {
    const { data, error } = await supabase
      .from('cv_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error retrieving submission', { id, error: error.message });
      throw error;
    }

    return data;
  },

  // Cleanup old submissions
  async cleanupOldSubmissions(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabase
      .from('cv_submissions')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      logger.error('Error cleaning up old submissions', { error: error.message });
      return 0;
    }

    logger.info('Cleaned up old submissions', { count: data.length, cutoffDate });
    return data.length;
  }
};

// Database metrics
const dbMetrics = {
  queryCount: 0,
  slowQueries: 0,
  errors: 0,
  avgResponseTime: 0,

  recordQuery(duration) {
    this.queryCount++;
    this.avgResponseTime = (this.avgResponseTime * (this.queryCount - 1) + duration) / this.queryCount;
    
    if (duration > 1000) { // Slow query threshold
      this.slowQueries++;
      logger.warn('Slow query detected', { duration: `${duration}ms` });
    }
  },

  recordError() {
    this.errors++;
  },

  getMetrics() {
    return {
      queryCount: this.queryCount,
      slowQueries: this.slowQueries,
      errors: this.errors,
      avgResponseTime: Math.round(this.avgResponseTime),
      errorRate: this.queryCount > 0 ? (this.errors / this.queryCount * 100).toFixed(2) : 0
    };
  },

  reset() {
    this.queryCount = 0;
    this.slowQueries = 0;
    this.errors = 0;
    this.avgResponseTime = 0;
  }
};

// Database middleware for query monitoring
const dbMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Override res.json to monitor response times
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - start;
    dbMetrics.recordQuery(duration);
    originalJson.call(this, data);
  };

  next();
};

module.exports = {
  supabase,
  checkDatabaseHealth,
  dbUtils,
  dbMetrics,
  dbMiddleware
}; 
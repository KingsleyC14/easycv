const Redis = require('ioredis');
const { logger } = require('./logger');

// Redis client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
});

// Cache configuration
const CACHE_TTL = {
  SUBMISSION: 3600, // 1 hour
  CV_CONTENT: 1800, // 30 minutes
  JOB_SPEC: 1800,   // 30 minutes
  API_RESPONSE: 300  // 5 minutes
};

// Cache middleware
const cacheMiddleware = (ttl = CACHE_TTL.API_RESPONSE) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        logger.info('Cache hit', { key, url: req.originalUrl });
        return res.json(data);
      }
      
      // Store original send method
      const originalSend = res.json;
      
      // Override send method to cache response
      res.json = function(data) {
        redis.setex(key, ttl, JSON.stringify(data))
          .catch(err => logger.error('Cache set error', { error: err.message }));
        
        originalSend.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error', { error: error.message });
      next();
    }
  };
};

// Cache utility functions
const cacheUtils = {
  // Set cache with TTL
  async set(key, value, ttl = CACHE_TTL.API_RESPONSE) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      logger.info('Cache set', { key, ttl });
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
    }
  },

  // Get cache value
  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  },

  // Delete cache key
  async del(key) {
    try {
      await redis.del(key);
      logger.info('Cache deleted', { key });
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
    }
  },

  // Clear all cache
  async clear() {
    try {
      const keys = await redis.keys('cache:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info('Cache cleared', { count: keys.length });
      }
    } catch (error) {
      logger.error('Cache clear error', { error: error.message });
    }
  },

  // Cache submission data
  async cacheSubmission(id, data) {
    const key = `submission:${id}`;
    await this.set(key, data, CACHE_TTL.SUBMISSION);
  },

  // Get cached submission
  async getSubmission(id) {
    const key = `submission:${id}`;
    return await this.get(key);
  },

  // Cache CV content
  async cacheCvContent(id, content) {
    const key = `cv:${id}`;
    await this.set(key, content, CACHE_TTL.CV_CONTENT);
  },

  // Get cached CV content
  async getCvContent(id) {
    const key = `cv:${id}`;
    return await this.get(key);
  }
};

// Health check for Redis
const checkRedisHealth = async () => {
  try {
    await redis.ping();
    logger.info('Redis connection healthy');
    return true;
  } catch (error) {
    logger.error('Redis health check failed', { error: error.message });
    return false;
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Closing Redis connection...');
  await redis.quit();
});

module.exports = {
  redis,
  cacheMiddleware,
  cacheUtils,
  checkRedisHealth,
  CACHE_TTL
}; 
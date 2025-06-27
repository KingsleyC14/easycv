const os = require('os');
const { logger } = require('./logger');
const { checkRedisHealth } = require('./cache');
const { checkDatabaseHealth } = require('./database');
const { queueUtils } = require('./queue');

// System health metrics
const healthMetrics = {
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  avgResponseTime: 0,
  memoryUsage: {},
  cpuUsage: {},

  recordRequest(duration) {
    this.requestCount++;
    this.avgResponseTime = (this.avgResponseTime * (this.requestCount - 1) + duration) / this.requestCount;
  },

  recordError() {
    this.errorCount++;
  },

  updateSystemMetrics() {
    this.memoryUsage = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      percentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
    };

    this.cpuUsage = {
      loadAverage: os.loadavg(),
      cores: os.cpus().length
    };
  },

  getMetrics() {
    this.updateSystemMetrics();
    
    return {
      uptime: Date.now() - this.startTime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount * 100).toFixed(2) : 0,
      avgResponseTime: Math.round(this.avgResponseTime),
      memory: this.memoryUsage,
      cpu: this.cpuUsage,
      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
      }
    };
  }
};

// Health check functions
const healthChecks = {
  // Basic application health
  async basicHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'easycv-backend'
    };
  },

  // Database health check
  async databaseHealth() {
    try {
      const result = await checkDatabaseHealth();
      return {
        status: result.healthy ? 'healthy' : 'unhealthy',
        database: 'supabase',
        responseTime: result.duration,
        error: result.error || null
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'supabase',
        error: error.message
      };
    }
  },

  // Redis health check
  async redisHealth() {
    try {
      const isHealthy = await checkRedisHealth();
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'redis',
        error: isHealthy ? null : 'Redis connection failed'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'redis',
        error: error.message
      };
    }
  },

  // Queue health check
  async queueHealth() {
    try {
      const stats = await queueUtils.getQueueStats();
      const totalJobs = Object.values(stats).reduce((sum, queue) => 
        sum + queue.waiting + queue.active + queue.completed + queue.failed, 0
      );
      
      return {
        status: 'healthy',
        service: 'queues',
        stats,
        totalJobs
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'queues',
        error: error.message
      };
    }
  },

  // System resources health check
  async systemHealth() {
    const metrics = healthMetrics.getMetrics();
    const memoryThreshold = 90; // 90% memory usage threshold
    const cpuThreshold = 80; // 80% CPU usage threshold
    
    const memoryHealthy = parseFloat(metrics.memory.percentage) < memoryThreshold;
    const cpuHealthy = metrics.cpu.loadAverage[0] < cpuThreshold;
    
    return {
      status: memoryHealthy && cpuHealthy ? 'healthy' : 'warning',
      service: 'system',
      memory: {
        usage: metrics.memory.percentage + '%',
        healthy: memoryHealthy,
        threshold: memoryThreshold + '%'
      },
      cpu: {
        loadAverage: metrics.cpu.loadAverage[0],
        healthy: cpuHealthy,
        threshold: cpuThreshold
      }
    };
  },

  // Comprehensive health check
  async comprehensiveHealth() {
    const checks = await Promise.allSettled([
      this.basicHealth(),
      this.databaseHealth(),
      this.redisHealth(),
      this.queueHealth(),
      this.systemHealth()
    ]);

    const results = checks.map((check, index) => {
      const checkNames = ['basic', 'database', 'redis', 'queue', 'system'];
      return {
        name: checkNames[index],
        ...check.value || { status: 'error', error: check.reason?.message }
      };
    });

    const allHealthy = results.every(check => check.status === 'healthy');
    const hasWarnings = results.some(check => check.status === 'warning');

    return {
      status: allHealthy ? 'healthy' : (hasWarnings ? 'warning' : 'unhealthy'),
      timestamp: new Date().toISOString(),
      checks: results,
      metrics: healthMetrics.getMetrics()
    };
  }
};

// Health check middleware
const healthCheckMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Override res.json to record metrics
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - start;
    healthMetrics.recordRequest(duration);
    
    if (res.statusCode >= 400) {
      healthMetrics.recordError();
    }
    
    originalJson.call(this, data);
  };

  next();
};

// Health check endpoints
const healthEndpoints = {
  // Basic health check
  async basic(req, res) {
    try {
      const health = await healthChecks.basicHealth();
      res.json(health);
    } catch (error) {
      logger.error('Basic health check failed', { error: error.message });
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  },

  // Database health check
  async database(req, res) {
    try {
      const health = await healthChecks.databaseHealth();
      res.json(health);
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  },

  // Redis health check
  async redis(req, res) {
    try {
      const health = await healthChecks.redisHealth();
      res.json(health);
    } catch (error) {
      logger.error('Redis health check failed', { error: error.message });
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  },

  // Queue health check
  async queue(req, res) {
    try {
      const health = await healthChecks.queueHealth();
      res.json(health);
    } catch (error) {
      logger.error('Queue health check failed', { error: error.message });
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  },

  // System health check
  async system(req, res) {
    try {
      const health = await healthChecks.systemHealth();
      res.json(health);
    } catch (error) {
      logger.error('System health check failed', { error: error.message });
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  },

  // Comprehensive health check
  async comprehensive(req, res) {
    try {
      const health = await healthChecks.comprehensiveHealth();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'warning' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Comprehensive health check failed', { error: error.message });
      res.status(503).json({ status: 'unhealthy', error: error.message });
    }
  },

  // Metrics endpoint
  async metrics(req, res) {
    try {
      const metrics = healthMetrics.getMetrics();
      res.json({
        timestamp: new Date().toISOString(),
        metrics
      });
    } catch (error) {
      logger.error('Metrics endpoint failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
};

// Scheduled health checks
const scheduleHealthChecks = () => {
  // Run system health check every 5 minutes
  setInterval(async () => {
    try {
      const health = await healthChecks.comprehensiveHealth();
      if (health.status !== 'healthy') {
        logger.warn('Health check warning', { status: health.status, checks: health.checks });
      }
    } catch (error) {
      logger.error('Scheduled health check failed', { error: error.message });
    }
  }, 5 * 60 * 1000); // 5 minutes
};

module.exports = {
  healthMetrics,
  healthChecks,
  healthCheckMiddleware,
  healthEndpoints,
  scheduleHealthChecks
}; 
const Queue = require('bull');
const { logger } = require('./logger');

// Queue configurations
const queueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
};

// Create queues
const cvProcessingQueue = new Queue('cv-processing', queueConfig);
const pdfGenerationQueue = new Queue('pdf-generation', queueConfig);
const cleanupQueue = new Queue('cleanup', queueConfig);

// CV Processing Queue
cvProcessingQueue.process(async (job) => {
  const { submissionId, originalCvContent, jobSpecContent } = job.data;
  
  logger.info('Processing CV', { submissionId, jobId: job.id });
  
  try {
    // Simulate CV processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Add to PDF generation queue
    await pdfGenerationQueue.add({
      submissionId,
      processedCvData: { /* processed data */ }
    });
    
    logger.info('CV processing completed', { submissionId, jobId: job.id });
    return { status: 'completed', submissionId };
  } catch (error) {
    logger.error('CV processing failed', { 
      submissionId, 
      jobId: job.id, 
      error: error.message 
    });
    throw error;
  }
});

// PDF Generation Queue
pdfGenerationQueue.process(async (job) => {
  const { submissionId, processedCvData } = job.data;
  
  logger.info('Generating PDF', { submissionId, jobId: job.id });
  
  try {
    // Simulate PDF generation time
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    logger.info('PDF generation completed', { submissionId, jobId: job.id });
    return { status: 'completed', submissionId, pdfUrl: 'generated-pdf-url' };
  } catch (error) {
    logger.error('PDF generation failed', { 
      submissionId, 
      jobId: job.id, 
      error: error.message 
    });
    throw error;
  }
});

// Cleanup Queue (runs daily)
cleanupQueue.process(async (job) => {
  logger.info('Running cleanup job', { jobId: job.id });
  
  try {
    // Clean up old files and data
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('Cleanup completed', { jobId: job.id });
    return { status: 'completed', cleanedItems: 0 };
  } catch (error) {
    logger.error('Cleanup failed', { jobId: job.id, error: error.message });
    throw error;
  }
});

// Queue event handlers
const setupQueueEvents = (queue, queueName) => {
  queue.on('completed', (job, result) => {
    logger.info(`${queueName} job completed`, { 
      jobId: job.id, 
      result: result.status 
    });
  });

  queue.on('failed', (job, err) => {
    logger.error(`${queueName} job failed`, { 
      jobId: job.id, 
      error: err.message,
      attempts: job.attemptsMade 
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`${queueName} job stalled`, { jobId: job.id });
  });

  queue.on('error', (error) => {
    logger.error(`${queueName} queue error`, { error: error.message });
  });
};

// Setup event handlers for all queues
setupQueueEvents(cvProcessingQueue, 'CV Processing');
setupQueueEvents(pdfGenerationQueue, 'PDF Generation');
setupQueueEvents(cleanupQueue, 'Cleanup');

// Queue management utilities
const queueUtils = {
  // Add CV processing job
  async addCvProcessingJob(submissionId, originalCvContent, jobSpecContent) {
    const job = await cvProcessingQueue.add({
      submissionId,
      originalCvContent,
      jobSpecContent
    }, {
      priority: 1,
      delay: 0
    });
    
    logger.info('CV processing job added', { submissionId, jobId: job.id });
    return job;
  },

  // Add PDF generation job
  async addPdfGenerationJob(submissionId, processedCvData) {
    const job = await pdfGenerationQueue.add({
      submissionId,
      processedCvData
    }, {
      priority: 2,
      delay: 0
    });
    
    logger.info('PDF generation job added', { submissionId, jobId: job.id });
    return job;
  },

  // Schedule cleanup job (daily at 2 AM)
  async scheduleCleanup() {
    const job = await cleanupQueue.add(
      {},
      {
        repeat: {
          cron: '0 2 * * *' // Daily at 2 AM
        }
      }
    );
    
    logger.info('Cleanup job scheduled', { jobId: job.id });
    return job;
  },

  // Get queue statistics
  async getQueueStats() {
    const stats = {};
    
    for (const [name, queue] of [
      ['cvProcessing', cvProcessingQueue],
      ['pdfGeneration', pdfGenerationQueue],
      ['cleanup', cleanupQueue]
    ]) {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed()
      ]);
      
      stats[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    }
    
    return stats;
  },

  // Pause all queues
  async pauseAllQueues() {
    await Promise.all([
      cvProcessingQueue.pause(),
      pdfGenerationQueue.pause(),
      cleanupQueue.pause()
    ]);
    
    logger.info('All queues paused');
  },

  // Resume all queues
  async resumeAllQueues() {
    await Promise.all([
      cvProcessingQueue.resume(),
      pdfGenerationQueue.resume(),
      cleanupQueue.resume()
    ]);
    
    logger.info('All queues resumed');
  },

  // Clean all queues
  async cleanAllQueues() {
    await Promise.all([
      cvProcessingQueue.clean(0, 'completed'),
      pdfGenerationQueue.clean(0, 'completed'),
      cleanupQueue.clean(0, 'completed')
    ]);
    
    logger.info('All queues cleaned');
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down queues gracefully...');
  
  await Promise.all([
    cvProcessingQueue.close(),
    pdfGenerationQueue.close(),
    cleanupQueue.close()
  ]);
  
  logger.info('All queues closed');
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = {
  cvProcessingQueue,
  pdfGenerationQueue,
  cleanupQueue,
  queueUtils,
  gracefulShutdown
}; 
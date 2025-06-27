const cluster = require('cluster');
const os = require('os');
const { logger } = require('./logger');

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died`, { code, signal });
    
    // Replace the dead worker
    logger.info('Starting a new worker...');
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    
    process.exit(0);
  });

} else {
  // Worker process
  logger.info(`Worker ${process.pid} started`);
  
  // Import and start the server
  require('../server.js');
}

module.exports = { cluster, numCPUs }; 
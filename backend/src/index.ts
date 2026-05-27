import 'dotenv/config';
import { createServer } from './api/server';
import { monitoringService } from './services/monitoring.service';
import { config } from './config';
import { logger } from './utils/logger';

// Register crash handlers first so nothing slips through
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

async function main(): Promise<void> {
  const app = createServer();

  const server = app.listen(config.PORT, () => {
    logger.info('VeilVault1 backend started', {
      port: config.PORT,
      network: config.STELLAR_NETWORK,
      vaultContract: config.VAULT_CONTRACT_ID ?? 'not configured',
      env: config.NODE_ENV,
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${config.PORT} is already in use. Kill the other process or change PORT in .env.`);
    } else {
      logger.error('Server error', { err: err.message });
    }
    process.exit(1);
  });

  // Start vault health monitoring
  if (config.VAULT_CONTRACT_ID) {
    monitoringService.onAlert(alert => {
      if (alert.level === 'error') {
        logger.error('VAULT ALERT', alert);
      }
    });
    monitoringService.startMonitoring(60_000);
  }

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down');
    monitoringService.stopMonitoring();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();

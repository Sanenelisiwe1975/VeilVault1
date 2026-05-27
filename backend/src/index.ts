import 'dotenv/config';
import { createServer } from './api/server';
import { monitoringService } from './services/monitoring.service';
import { config } from './config';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const app = createServer();

  app.listen(config.PORT, () => {
    logger.info('VeilVault1 backend started', {
      port: config.PORT,
      network: config.STELLAR_NETWORK,
      vaultContract: config.VAULT_CONTRACT_ID ?? 'not configured',
      env: config.NODE_ENV,
    });
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
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    monitoringService.stopMonitoring();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    monitoringService.stopMonitoring();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

main();

import { createChildLogger } from '../utils/logger';
import { getVaultService } from './vault.service';
import { config } from '../config';

const log = createChildLogger('monitoring');

interface VaultSnapshot {
  timestamp: number;
  totalAssets: bigint;
  totalShares: bigint;
  sharePrice: bigint;
  contractId: string;
}

interface Alert {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

type AlertHandler = (alert: Alert) => void;

export class MonitoringService {
  private snapshots: VaultSnapshot[] = [];
  private alertHandlers: AlertHandler[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  private emit(alert: Omit<Alert, 'timestamp'>): void {
    const full: Alert = { ...alert, timestamp: Date.now() };
    log[full.level](full, full.message);
    this.alertHandlers.forEach(h => h(full));
  }

  /** Start periodic vault health checks. */
  startMonitoring(intervalMs = 60_000): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.runChecks(), intervalMs);
    log.info({ intervalMs }, 'Monitoring started');
    this.runChecks(); // immediate first run
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Monitoring stopped');
    }
  }

  private async runChecks(): Promise<void> {
    if (!config.VAULT_CONTRACT_ID) return;

    try {
      const vault = getVaultService();
      const [totalAssets, totalShares, sharePrice] = await Promise.all([
        vault.getTotalAssets(),
        vault.getTotalShares(),
        vault.getSharePrice(),
      ]);

      const snapshot: VaultSnapshot = {
        timestamp: Date.now(),
        totalAssets,
        totalShares,
        sharePrice,
        contractId: config.VAULT_CONTRACT_ID,
      };

      this.snapshots.push(snapshot);
      // Keep last 1440 snapshots (24h at 1-min intervals)
      if (this.snapshots.length > 1440) this.snapshots.shift();

      // Check for anomalies
      this.checkForAnomalies(snapshot);
    } catch (err) {
      this.emit({
        level: 'error',
        code: 'HEALTH_CHECK_FAILED',
        message: `Vault health check failed: ${(err as Error).message}`,
      });
    }
  }

  private checkForAnomalies(current: VaultSnapshot): void {
    if (this.snapshots.length < 2) return;
    const prev = this.snapshots[this.snapshots.length - 2];

    // Detect large asset drop
    if (prev.totalAssets > 0n) {
      const dropBps = ((prev.totalAssets - current.totalAssets) * 10_000n) / prev.totalAssets;
      if (dropBps > 500n) { // > 5% drop
        this.emit({
          level: 'warn',
          code: 'LARGE_ASSET_DROP',
          message: `Vault assets dropped by ${dropBps}bps`,
          data: {
            previous: prev.totalAssets.toString(),
            current: current.totalAssets.toString(),
            dropBps: dropBps.toString(),
          },
        });
      }
    }

    // Detect share price anomaly
    if (prev.sharePrice > 0n) {
      const priceDrop = ((prev.sharePrice - current.sharePrice) * 10_000n) / prev.sharePrice;
      if (priceDrop > 1000n) { // > 10% price drop
        this.emit({
          level: 'error',
          code: 'SHARE_PRICE_CRASH',
          message: `Share price crashed by ${priceDrop}bps`,
          data: {
            previous: prev.sharePrice.toString(),
            current: current.sharePrice.toString(),
          },
        });
      }
    }
  }

  getLatestSnapshot(): VaultSnapshot | null {
    return this.snapshots.at(-1) ?? null;
  }

  getSnapshots(limit = 60): VaultSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /** Serialize snapshots for the API (BigInt → string). */
  getSnapshotsForApi(limit = 60): object[] {
    return this.getSnapshots(limit).map(s => ({
      ...s,
      totalAssets: s.totalAssets.toString(),
      totalShares: s.totalShares.toString(),
      sharePrice: s.sharePrice.toString(),
    }));
  }
}

export const monitoringService = new MonitoringService();

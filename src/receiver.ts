import { logger } from './util/logger';
import { spawn, ChildProcess } from 'child_process';

import { Rx, RxStatus } from './types';

export class Receiver {
  private id: string;
  private whepURL: URL;
  private srtURL: URL;
  private status: RxStatus;
  private processSpawner: any;
  private process: ChildProcess | undefined;
  private errorOutput: string[];
  private retryTimeoutMs: number;
  private retryTimeoutHandle: NodeJS.Timeout | undefined;

  constructor(id: string, whepUrl: URL, srtUrl: URL, processSpawner?: any) {
    this.id = id;
    this.whepURL = whepUrl;
    this.srtURL = srtUrl;
    this.status = RxStatus.IDLE;
    this.process = undefined;
    this.errorOutput = [];
    this.retryTimeoutMs = 1000; // Start with 1 second
    this.retryTimeoutHandle = undefined;

    this.processSpawner = processSpawner ? processSpawner : spawn;
  }

  getObject(): Rx {
    return {
      id: this.id,
      whepUrl: this.whepURL.toString(),
      srtUrl: this.srtURL.toString(),
      status: this.status
    };
  }

  getId(): string {
    return this.id;
  }

  getWhepUrl(): URL {
    return this.whepURL;
  }

  getSrtUrl(): URL {
    return this.srtURL;
  }

  getStatus(): RxStatus {
    return this.status;
  }

  async start(isAutoRestart = false) {
    logger.info(`[${this.id}]: Starting reception from ${this.whepURL.href}`);

    // Reset retry timeout only on manual start (not on automatic restart)
    if (!isAutoRestart) {
      this.retryTimeoutMs = 1000;

      // Clear any pending retry timeout
      if (this.retryTimeoutHandle) {
        clearTimeout(this.retryTimeoutHandle);
        this.retryTimeoutHandle = undefined;
      }
    }

    const opts = ['-i', this.whepURL.href, '-o', this.srtURL.href];

    // Clear error output from previous runs
    this.errorOutput = [];

    this.process = this.processSpawner('whep-srt', opts);
    this.status = RxStatus.RUNNING;
    logger.info(`[${this.id}]: Receiver is running`);

    if (this.process) {
      this.process.stdout?.on('data', (data: Buffer) => {
        logger.debug(`[${this.id}]: ${data}`);
      });
      this.process.stderr?.on('data', (data: Buffer) => {
        logger.debug(`[${this.id}]: ${data}`);
        this.errorOutput.push(data.toString());
      });
      this.process.on('exit', (code: number | null) => {
        logger.info(`[${this.id}]: Receiver has stopped (${code || 0})`);
        logger.debug(this.process?.spawnargs);
        if (code && code > 0) {
          logger.info(`[${this.id}]: Receiver has unintentionally stopped`);
          this.status = RxStatus.FAILED;
          // Log error output at error level
          if (this.errorOutput.length > 0) {
            logger.error(
              `[${this.id}]: Error output from whep-srt process:\n${this.errorOutput.join('')}`
            );
          }
          // Schedule automatic restart with exponential backoff
          this.scheduleRestart();
        } else {
          this.status = RxStatus.STOPPED;
        }
      });
    }
  }

  async stop({ doAwait }: { doAwait: boolean }) {
    logger.info(`[${this.id}]: Stopping reception from ${this.whepURL.href}`);

    // Reset retry timeout on manual stop
    this.retryTimeoutMs = 1000;

    // Clear any pending retry timeout
    if (this.retryTimeoutHandle) {
      clearTimeout(this.retryTimeoutHandle);
      this.retryTimeoutHandle = undefined;
    }

    if (this.process) {
      // First, try graceful shutdown with SIGINT (Ctrl-C equivalent)
      logger.info(`[${this.id}]: Sending SIGINT for graceful shutdown`);
      this.process.kill('SIGINT');

      // Wait up to 2 seconds for graceful shutdown
      const gracefulTimeout = 2000;
      const startTime = Date.now();

      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;

          // Check if process has exited gracefully
          if ([RxStatus.STOPPED, RxStatus.FAILED].includes(this.status)) {
            clearInterval(checkInterval);
            logger.info(`[${this.id}]: Process stopped gracefully`);
            resolve();
            return;
          }

          // If timeout exceeded, force kill
          if (elapsed >= gracefulTimeout) {
            clearInterval(checkInterval);
            logger.warn(`[${this.id}]: Graceful shutdown timeout, sending SIGKILL`);
            if (this.process && !this.process.killed) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }
        }, 100);
      });
    } else {
      this.status = RxStatus.STOPPED;
    }
    if (doAwait) {
      await this.waitFor({ desiredStatus: [RxStatus.STOPPED, RxStatus.FAILED] });
    }
  }

  waitFor({ desiredStatus }: { desiredStatus: RxStatus[] }): Promise<void> {
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (desiredStatus.includes(this.status)) {
          clearInterval(t);
          resolve();
        }
      }, 500);
    });
  }

  private scheduleRestart() {
    // Clear any existing retry timeout
    if (this.retryTimeoutHandle) {
      clearTimeout(this.retryTimeoutHandle);
    }

    logger.info(`[${this.id}]: Scheduling automatic restart in ${this.retryTimeoutMs}ms`);

    this.retryTimeoutHandle = setTimeout(() => {
      logger.info(`[${this.id}]: Automatically restarting receiver after ${this.retryTimeoutMs}ms`);

      // Double the timeout for next retry (exponential backoff)
      this.retryTimeoutMs = this.retryTimeoutMs * 2;

      // Restart the receiver (pass true to indicate this is an automatic restart)
      this.start(true);
    }, this.retryTimeoutMs);
  }
}

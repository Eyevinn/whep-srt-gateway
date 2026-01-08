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
  private operationMutex: Promise<void> = Promise.resolve();
  private intentionalStop = false;
  private disposed = false;

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
    // Acquire mutex (synchronous - happens before any await)
    const prevOperation = this.operationMutex;
    let releaseLock: () => void;
    this.operationMutex = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevOperation;

    try {
      // Prevent operations on disposed receiver
      if (this.disposed) {
        logger.warn(`[${this.id}]: Receiver is disposed, ignoring start request`);
        return;
      }

      // Prevent concurrent start calls
      if (this.status === RxStatus.RUNNING) {
        logger.warn(`[${this.id}]: Receiver is already running, ignoring start request`);
        return;
      }

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

      // Kill existing process before spawning new one
      if (this.process) {
        logger.info(`[${this.id}]: Killing existing process before starting new one`);
        this.intentionalStop = true;
        await this.killProcess();
      }

      const opts = ['-i', this.whepURL.href, '-o', this.srtURL.href];

      // Clear error output from previous runs
      this.errorOutput = [];

      // Set status to RUNNING immediately to prevent race condition
      this.status = RxStatus.RUNNING;

      this.process = this.processSpawner('whep-srt', opts);
      this.intentionalStop = false; // Reset flag for new process
      logger.info(`[${this.id}]: Receiver is running`);

      if (this.process) {
        // Capture process reference for event handlers to check identity
        const currentProcess = this.process;

        currentProcess.stdout?.on('data', (data: Buffer) => {
          logger.debug(`[${this.id}]: ${data}`);
        });
        currentProcess.stderr?.on('data', (data: Buffer) => {
          logger.debug(`[${this.id}]: ${data}`);
          // Only collect error output if this is still the current process
          if (this.process === currentProcess) {
            this.errorOutput.push(data.toString());
          }
        });
        currentProcess.on('exit', (code: number | null) => {
          // Ignore events from old processes
          if (this.process !== currentProcess) {
            logger.debug(`[${this.id}]: Ignoring exit event from old process`);
            return;
          }

          logger.info(`[${this.id}]: Receiver has stopped (${code || 0})`);
          logger.debug(currentProcess.spawnargs);

          // Clear process reference
          this.process = undefined;

          // If this was an intentional stop (from stop() or start() killing old process),
          // don't treat it as a failure and don't schedule restart
          if (this.intentionalStop) {
            logger.debug(`[${this.id}]: Intentional stop, not scheduling restart`);
            this.status = RxStatus.STOPPED;
            return;
          }

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
    } finally {
      releaseLock!();
    }
  }

  async stop({ doAwait }: { doAwait: boolean }) {
    // Acquire mutex (synchronous - happens before any await)
    const prevOperation = this.operationMutex;
    let releaseLock: () => void;
    this.operationMutex = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevOperation;

    try {
      logger.info(`[${this.id}]: Stopping reception from ${this.whepURL.href}`);

      // Reset retry timeout on manual stop
      this.retryTimeoutMs = 1000;

      // Clear any pending retry timeout
      if (this.retryTimeoutHandle) {
        clearTimeout(this.retryTimeoutHandle);
        this.retryTimeoutHandle = undefined;
      }

      if (this.process) {
        this.intentionalStop = true;
        await this.killProcess();
        // Clear retry timeout AGAIN - exit handler may have scheduled a new one
        if (this.retryTimeoutHandle) {
          clearTimeout(this.retryTimeoutHandle);
          this.retryTimeoutHandle = undefined;
        }
      }
      // Set status to STOPPED after intentional stop (regardless of exit code)
      this.status = RxStatus.STOPPED;

      if (doAwait) {
        await this.waitFor({ desiredStatus: [RxStatus.STOPPED, RxStatus.FAILED] });
      }
    } finally {
      releaseLock!();
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

  private async killProcess(): Promise<void> {
    if (!this.process) {
      return;
    }

    const processToKill = this.process;

    return new Promise<void>((resolve) => {
      processToKill.once('exit', () => {
        resolve();
      });

      // First, try graceful shutdown with SIGINT
      logger.info(`[${this.id}]: Sending SIGINT for graceful shutdown`);
      processToKill.kill('SIGINT');

      // Wait up to 2 seconds for graceful shutdown, then force kill
      setTimeout(() => {
        if (!processToKill.killed) {
          logger.warn(`[${this.id}]: Graceful shutdown timeout, sending SIGKILL`);
          processToKill.kill('SIGKILL');
        }
      }, 2000);
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

  /**
   * Dispose of the receiver, stopping any running process and cancelling pending restarts.
   * After disposal, the receiver cannot be started again.
   * This method acquires the mutex to ensure no race conditions with start/stop operations.
   */
  async dispose(): Promise<void> {
    // Acquire mutex (synchronous - happens before any await)
    const prevOperation = this.operationMutex;
    let releaseLock: () => void;
    this.operationMutex = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevOperation;

    try {
      if (this.disposed) {
        logger.debug(`[${this.id}]: Receiver already disposed`);
        return;
      }

      logger.info(`[${this.id}]: Disposing receiver`);

      // Mark as disposed first to prevent any new operations
      this.disposed = true;

      // Cancel any pending restart timer
      if (this.retryTimeoutHandle) {
        clearTimeout(this.retryTimeoutHandle);
        this.retryTimeoutHandle = undefined;
      }

      // Stop any running process
      if (this.process) {
        this.intentionalStop = true;
        await this.killProcess();
      }

      this.status = RxStatus.STOPPED;
    } finally {
      releaseLock!();
    }
  }
}

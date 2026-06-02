import { Subscription, interval } from 'rxjs';
import { take } from 'rxjs/operators';

/**
 * Shared polling configuration and helper for status polling.
 * Used by both AppsManagerComponent and StarterPacksComponent.
 * 
 * Provides consistent polling behavior across the application:
 * - Same timeout (180 minutes) for slow downloads (Oracle, WordPress, etc.)
 * - Same polling interval (3 seconds)
 * - Same state detection logic
 */
export class PollingHelper {
  // Polling interval in milliseconds
  public static readonly POLLING_INTERVAL_MS = 3000;
  
  // Max polling iterations: 3s * 3600 = 180 minutes (3 hours)
  // Long timeout to accommodate slow networks/computers downloading large Docker images
  // (Oracle, WordPress + MySQL + Tailwind build, etc.)
  public static readonly MAX_POLLING_ITERATIONS = 3600;
  
  // Transitional states that trigger/continue polling
  public static readonly TRANSITIONAL_STATES = ['starting', 'stopping'];
  
  // Stable states that allow polling to stop
  public static readonly STABLE_STATES = ['running', 'stopped', 'error', 'unknown'];
  
  /**
   * Check if a state is transitional (starting/stopping).
   */
  public static isTransitionalState(state: string | undefined): boolean {
    return state ? this.TRANSITIONAL_STATES.includes(state) : false;
  }
  
  /**
   * Check if a state is stable (running/stopped/error/unknown).
   */
  public static isStableState(state: string | undefined): boolean {
    return state ? this.STABLE_STATES.includes(state) : true;
  }
  
  /**
   * Check if any item in an array has a transitional state.
   * Works with any object that has a 'state' or 'status' property.
   */
  public static hasTransitionalItems(items: Array<{ state?: string; status?: string }>): boolean {
    return items.some(item => {
      const state = item.state || item.status;
      return this.isTransitionalState(state);
    });
  }
  
  /**
   * Determine the UI state based on backend status.
   * Backend already translates "running but unhealthy" → "starting".
   * 
   * @param backendStatus - Status returned from the backend API
   * @returns The UI state to display
   */
  public static mapBackendStatusToUiState(
    backendStatus: string | undefined
  ): 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown' {
    if (!backendStatus) return 'unknown';
    
    switch (backendStatus) {
      case 'running':
        // Container is running AND healthy (backend only reports 'running' when healthy)
        return 'running';
      case 'starting':
        // Container is running but healthcheck not yet passed
        return 'starting';
      case 'stopping':
        return 'stopping';
      case 'exited':
      case 'stopped':
        return 'stopped';
      case 'error':
        return 'error';
      default:
        return 'stopped';
    }
  }
  
  /**
   * Create a polling subscription that calls a callback at regular intervals.
   * Automatically stops after MAX_POLLING_ITERATIONS.
   * 
   * @param onPoll - Async callback to execute on each poll. Return `true` to stop polling.
   * @param onComplete - Optional callback when polling completes (max iterations or stopped)
   * @param onError - Optional error handler
   * @returns Subscription that can be unsubscribed to stop polling
   */
  public static createPollingSubscription(
    onPoll: () => Promise<boolean>,
    onComplete?: (reason: 'stable' | 'maxIterations' | 'unsubscribed') => void,
    onError?: (err: any) => void
  ): Subscription {
    let iterationCount = 0;
    
    return interval(this.POLLING_INTERVAL_MS).pipe(
      take(this.MAX_POLLING_ITERATIONS)
    ).subscribe({
      next: async () => {
        iterationCount++;
        // console.log(`Polling iteration ${iterationCount}/${this.MAX_POLLING_ITERATIONS}...`);
        
        try {
          const shouldStop = await onPoll();
          if (shouldStop) {
            // console.log(`Polling stopped: stable state reached after ${iterationCount} iterations`);
            // Note: We can't unsubscribe from within the callback, 
            // the caller should track and stop the subscription
          }
        } catch (err) {
          console.error('Error during poll:', err);
          if (onError) onError(err);
        }
      },
      complete: () => {
        if (iterationCount >= this.MAX_POLLING_ITERATIONS) {
          console.warn(`Polling stopped: max iterations (${this.MAX_POLLING_ITERATIONS}) reached. Some items may still be in transitional state.`);
          if (onComplete) onComplete('maxIterations');
        }
      },
      error: (err) => {
        console.error('Polling subscription error:', err);
        if (onError) onError(err);
      }
    });
  }
  
  /**
   * High-level polling loop for Docker container lifecycles. Wraps
   * `createPollingSubscription` with the standard "poll until no transitional
   * items remain" pattern used by AppsManagerComponent and StarterPacksComponent.
   *
   * The caller owns the returned Subscription so it can unsubscribe on destroy.
   *
   * @param config.refresh          Called every tick; should refresh status (silently)
   * @param config.getItems         Returns the list to check for transitional items
   * @param config.onMaxIterations  Called when the max timeout is reached
   * @param config.label            Prefix for log messages (e.g. 'AppsManager')
   */
  public static startLifecyclePolling(config: {
    refresh: () => Promise<void>;
    getItems: () => Array<{ state?: string; status?: string }>;
    onMaxIterations: () => void;
    label: string;
  }): Subscription {
    // console.log(`[${config.label}] Starting polling subscription (max timeout: ${this.getMaxTimeoutDescription()})...`);

    let subscription: Subscription;
    subscription = this.createPollingSubscription(
      async () => {
        await config.refresh();
        const hasTransitional = this.hasTransitionalItems(config.getItems());
        if (!hasTransitional) {
          // Actually unsubscribe — createPollingSubscription can't do it from within onPoll
          if (subscription) subscription.unsubscribe();
          return true;
        }
        return false;
      },
      (reason) => {
        if (reason === 'maxIterations') {
          console.warn(`[${config.label}] Polling stopped: max iterations reached.`);
          config.onMaxIterations();
        }
      },
      (err) => {
        console.error(`[${config.label}] Polling error:`, err);
      },
    );
    return subscription;
  }

  /**
   * Calculate the max timeout in human-readable format.
   */
  public static getMaxTimeoutDescription(): string {
    const totalSeconds = (this.POLLING_INTERVAL_MS / 1000) * this.MAX_POLLING_ITERATIONS;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return minutes > 0 ? `${hours} hours ${minutes} minutes` : `${hours} hours`;
    }
    return `${minutes} minutes`;
  }
}

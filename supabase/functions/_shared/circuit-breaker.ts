/**
 * Circuit Breaker Pattern for Resilient Edge Functions
 * Prevents cascading failures by tracking error rates
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests, circuit tripped
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before attempting half-open
  resetTimeout: number;          // Time to reset failure count in closed state
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,        // 30 seconds
  resetTimeout: 60000    // 1 minute
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastStateChange: number = Date.now();
  
  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed to attempt half-open
      if (Date.now() - this.lastStateChange >= this.config.timeout) {
        console.log(`[CircuitBreaker:${this.name}] Attempting half-open state`);
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        console.log(`[CircuitBreaker:${this.name}] Closing circuit after ${this.successCount} successes`);
        this.state = CircuitState.CLOSED;
        this.lastStateChange = Date.now();
      }
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[CircuitBreaker:${this.name}] Opening circuit - half-open test failed`);
      this.state = CircuitState.OPEN;
      this.lastStateChange = Date.now();
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      console.log(`[CircuitBreaker:${this.name}] Opening circuit after ${this.failureCount} failures`);
      this.state = CircuitState.OPEN;
      this.lastStateChange = Date.now();
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit metrics
   */
  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange
    };
  }

  /**
   * Reset circuit breaker (for testing or manual intervention)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
  }
}

// Global circuit breakers for common services
export const aiCircuitBreaker = new CircuitBreaker('AI_SERVICE', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000
});

export const dbCircuitBreaker = new CircuitBreaker('DATABASE', {
  failureThreshold: 10,
  successThreshold: 3,
  timeout: 20000,
  resetTimeout: 60000
});

export const storageCircuitBreaker = new CircuitBreaker('STORAGE', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 25000,
  resetTimeout: 60000
});

/**
 * Wrapper function to add circuit breaker to any async operation
 */
export function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  return breaker.execute(fn);
}
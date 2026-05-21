/**
 * HTTP client for Server-side Analytics API (DuckDB/ClickHouse)
 * Provides type-safe interface for server-side pivot table operations
 */

import type { PivotEngine } from './pivot-types';

// Server-side request/response types matching Java DTOs
export interface ServerPivotRequest {
  /** Server resolves connectionCode + tableName from the reportId. */
  reportId: string;
  /** Backend engine (if omitted, backend auto-detects from connection type). */
  engine?: 'duckdb' | 'clickhouse';
  rows?: string[];
  cols?: string[];
  vals?: string[];
  aggregatorName?: string;
  filters?: Record<string, string[]>;
  rowOrder?: 'key_a_to_z' | 'value_a_to_z' | 'value_z_to_a';
  colOrder?: 'key_a_to_z' | 'value_a_to_z' | 'value_z_to_a';
  includeSubtotals?: boolean;
  limit?: number;
}

export interface ServerPivotResponse {
  data: Record<string, any>[];
  aggregatedData?: Record<string, any>;
  metadata: {
    executionTimeMs: number;
    rowCount: number;
    aggregatorUsed: string;
    cached: boolean;
    availableColumns?: string[];
  };
}

export interface AggregatorInfo {
  name: string;
  displayName: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  supportedAggregators: number;
}

export interface ErrorResponse {
  error: string;
  timestamp: number;
}

/**
 * Client for /api/analytics endpoints
 */
export class PivotApiClient {
  public baseUrl: string;
  private abortControllers: Map<string, AbortController>;

  constructor(baseUrl: string = '/api/analytics') {
    this.baseUrl = baseUrl;
    this.abortControllers = new Map();
  }

  /**
   * Execute a pivot table query on the server.
   *
   * @param request The pivot configuration
   * @param requestId Optional ID for request cancellation
   * @returns Promise<ServerPivotResponse>
   */
  async executePivot(
    request: ServerPivotRequest,
    requestId?: string
  ): Promise<ServerPivotResponse> {
    const url = `${this.baseUrl}/pivot`;

    // Create abort controller for this request
    const abortController = new AbortController();
    if (requestId) {
      // Cancel any existing request with same ID
      this.cancelRequest(requestId);
      this.abortControllers.set(requestId, abortController);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const error: ErrorResponse = await response.json();
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ServerPivotResponse = await response.json();
      return data;

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request was cancelled');
        }
        throw error;
      }
      throw new Error('Unknown error occurred');

    } finally {
      // Clean up abort controller
      if (requestId) {
        this.abortControllers.delete(requestId);
      }
    }
  }

  /**
   * Get list of supported aggregators.
   *
   * @returns Promise<string[]>
   */
  async getSupportedAggregators(): Promise<string[]> {
    const url = `${this.baseUrl}/aggregators`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get aggregator display names for UI.
   *
   * @returns Promise<Record<string, string>>
   */
  async getAggregatorDisplayNames(): Promise<Record<string, string>> {
    const url = `${this.baseUrl}/aggregators/display-names`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Health check for analytics service.
   *
   * @returns Promise<HealthStatus>
   */
  async health(): Promise<HealthStatus> {
    const url = `${this.baseUrl}/health`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Cancel an ongoing request by ID.
   *
   * @param requestId The request ID to cancel
   */
  cancelRequest(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  /**
   * Cancel all ongoing requests.
   */
  cancelAllRequests(): void {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }
}

/**
 * Default singleton instance
 */
export const pivotApi = new PivotApiClient();

/**
 * Helper to convert client-side valueFilter to server-side filters
 *
 * Client format: { country: { 'USA': true, 'Canada': true } }
 * Server format: { country: ['USA', 'Canada'] }
 */
export function convertValueFilterToServerFilters(
  valueFilter?: Record<string, Record<string, boolean>>
): Record<string, string[]> | undefined {
  if (!valueFilter) return undefined;

  const filters: Record<string, string[]> = {};

  for (const [attr, values] of Object.entries(valueFilter)) {
    const selectedValues = Object.entries(values)
      .filter(([_, isSelected]) => isSelected)
      .map(([value]) => value);

    if (selectedValues.length > 0) {
      filters[attr] = selectedValues;
    }
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * Helper to build ServerPivotRequest from PivotTable state.
 * Uses reportId so the server resolves connectionCode + tableName internally.
 */
export function buildServerPivotRequest(
  reportId: string,
  state: {
    rows?: string[];
    cols?: string[];
    vals?: string[];
    aggregatorName?: string;
    valueFilter?: Record<string, Record<string, boolean>>;
    rowOrder?: 'key_a_to_z' | 'value_a_to_z' | 'value_z_to_a';
    colOrder?: 'key_a_to_z' | 'value_a_to_z' | 'value_z_to_a';
  },
  engine?: 'duckdb' | 'clickhouse'
): ServerPivotRequest {
  return {
    reportId,
    engine,
    rows: state.rows || [],
    cols: state.cols || [],
    vals: state.vals || [],
    aggregatorName: state.aggregatorName || 'Count',
    filters: convertValueFilterToServerFilters(state.valueFilter),
    rowOrder: state.rowOrder || 'key_a_to_z',
    colOrder: state.colOrder || 'key_a_to_z',
    includeSubtotals: false,
  };
}

import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { ReportParameter, ConfigurationRepository } from './configuration-repository.service';

export interface ReportDataResult {
  data: Array<Record<string, any>>;
  reportColumnNames: string[];
  executionTimeMillis: number;
  totalRows: number;
  truncated: boolean;
}

// Flat map matching tabulator.info constructor options directly
export interface TabulatorOptionsDto {
  columns?: Array<{ title?: string; field?: string; [k: string]: any }>;
  data?: Array<Record<string, any>>;
  namedOptions?: Record<string, Record<string, any>>; // componentId → options for aggregator reports
  [k: string]: any; // all other tabulator.info options (layout, height, pagination, etc.)
}

export interface ChartOptionsDto {
  type?: string;
  labelField?: string; // Which column from reportData to use for X-axis labels
  options?: any; // Chart.js options passthrough
  labels?: string[]; // Explicit labels override
  datasets?: Array<{ field?: string; label?: string; type?: string; [k: string]: any }>; // Series/dataset configurations
  data?: Array<Record<string, any>>; // Optional data override (defaults to reportData)
  namedOptions?: Record<string, ChartOptionsDto>; // componentId → options for aggregator reports
}

export interface PivotTableOptionsDto {
  rows?: string[]; // Fields to use as row headers
  cols?: string[]; // Fields to use as column headers
  vals?: string[]; // Fields to aggregate on
  aggregatorName?: string; // e.g., 'Count', 'Sum', 'Average', etc.
  rendererName?: string; // e.g., 'Table', 'Table Heatmap', etc.
  rowOrder?: string; // 'key_a_to_z', 'value_a_to_z', 'value_z_to_a'
  colOrder?: string; // 'key_a_to_z', 'value_a_to_z', 'value_z_to_a'
  valueFilter?: { [attr: string]: { [value: string]: boolean } }; // Filter out specific values
  options?: any; // Additional options
  data?: Array<Record<string, any>>; // Optional data override
  // UI control attributes
  hiddenAttributes?: string[]; // Attributes hidden entirely
  hiddenFromAggregators?: string[]; // Hidden from aggregator dropdown
  hiddenFromDragDrop?: string[]; // Hidden from drag-drop
  unusedOrientationCutoff?: number; // Layout threshold (default 85)
  menuLimit?: number; // Max values in filter menu (default 500)
  // Custom sorters and derived columns
  sorters?: { [attr: string]: any }; // Custom sort order per attribute
  derivedAttributes?: { [name: string]: string }; // Computed columns
  namedOptions?: Record<string, PivotTableOptionsDto>; // componentId → options for aggregator reports
}

@Injectable({
  providedIn: 'root',
})
export class ReportingService {
  constructor(
    protected apiService: ApiService,
    protected settingsService: ConfigurationRepository,
  ) {}

  // V4: base URL for web components (rb-tabulator, rb-chart, rb-pivot-table).
  // Component appends /reports/{id}/data to this — so /api is the right base now.
  get reportingApiBaseUrl(): string {
    return this.apiService.BACKEND_URL;
  }

  async fetchData(
    parameters: { [key: string]: any },
    testMode: boolean = false,
    reportId: string = this.settingsService.currentConfigurationTemplate
      ?.folderName,
  ) {
    const params = new URLSearchParams();
    if (testMode) {
      params.set('testMode', 'true');
    }

    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.set(key, value.toString());
      }
    });

    const paramsObj = {};
    params.forEach((value, key) => {
      paramsObj[key] = value;
    });

    const result = await this.apiService.get(
      `/reports/${reportId}/data`,
      paramsObj,
    );
    return result;
  }

  async processGroovyParametersDsl(
    groovyDslCode: string,
    connectionCode?: string,
  ): Promise<ReportParameter[]> {
    const body: any = { dslCode: groovyDslCode };
    if (connectionCode) body.connectionCode = connectionCode;
    const resp = await this.apiService.post(`/dsl/reportparameters/parse`, body);
    return resp?.parameters ?? resp;
  }

  async processGroovyTabulatorDsl(
    groovyDslCode: string,
  ): Promise<TabulatorOptionsDto> {
    const resp = await this.apiService.post(`/dsl/tabulator/parse`, { dslCode: groovyDslCode });
    return resp?.options ?? resp;
  }

  async processGroovyChartDsl(
    groovyDslCode: string,
  ): Promise<ChartOptionsDto> {
    const resp = await this.apiService.post(`/dsl/chart/parse`, { dslCode: groovyDslCode });
    return resp?.options ?? resp;
  }

  async processGroovyPivotTableDsl(
    groovyDslCode: string,
  ): Promise<PivotTableOptionsDto> {
    const resp = await this.apiService.post(`/dsl/pivot/parse`, { dslCode: groovyDslCode });
    return resp?.options ?? resp;
  }
}

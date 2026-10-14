/**
 * Pivot Table Renderers - Table rendering and Chart.js integration
 * Ported from react-pivottable/TableRenderers.jsx and PlotlyRenderers.jsx
 */

import { PivotData, pivotCellFormat } from './pivot-data';
import type { ChartJSData, ChartJSDataset, HeatmapMode, PivotDataProps } from './pivot-types';
import { paintedCellStyle } from '../../shared/readable-text';

// ============================================================================
// Table Helper Functions
// ============================================================================

/**
 * Calculate row/col span for merged cells in pivot table
 */
export function spanSize(arr: string[][], i: number, j: number): number {
  if (i !== 0) {
    let noDraw = true;
    for (let x = 0; x <= j; x++) {
      if (arr[i - 1][x] !== arr[i][x]) {
        noDraw = false;
        break;
      }
    }
    if (noDraw) return -1;
  }
  
  let len = 0;
  while (i + len < arr.length) {
    let stop = false;
    for (let x = 0; x <= j; x++) {
      if (arr[i][x] !== arr[i + len][x]) {
        stop = true;
        break;
      }
    }
    if (stop) break;
    len++;
  }
  return len;
}

/**
 * Default red color scale generator for heatmaps
 */
export function redColorScaleGenerator(values: number[]): (x: number) => { backgroundColor: string } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (x: number) => {
    const nonRed = 255 - Math.round((255 * (x - min)) / (max - min));
    return { backgroundColor: `rgb(255,${nonRed},${nonRed})` };
  };
}

// ============================================================================
// Table Rendering - Generate HTML table from PivotData
// ============================================================================

export interface TableRenderOptions {
  heatmapMode?: HeatmapMode;
  colorScaleGenerator?: (values: number[]) => (x: number) => { backgroundColor: string };
  /** If true, adds data attributes to cells for click handling */
  clickable?: boolean;
  /** If false, suppresses the rightmost "Totals" column. Default: true (back-compat). */
  showRowTotals?: boolean;
  /** If false, suppresses the bottom grand-totals row. Default: true (back-compat). */
  showColTotals?: boolean;
}

/**
 * Render pivot table as HTML string (for direct innerHTML insertion)
 */
export function renderPivotTableHTML(
  pivotData: PivotData,
  options: TableRenderOptions = {}
): string {
  const {
    heatmapMode,
    colorScaleGenerator = redColorScaleGenerator,
    showRowTotals = true,
    showColTotals = true,
  } = options;

  const colAttrs = pivotData.props.cols || [];
  const rowAttrs = pivotData.props.rows || [];
  const rowKeys = pivotData.getRowKeys();
  const colKeys = pivotData.getColKeys();

  // When cols=[] (no column dimension), colKeys is empty and the row-total cell
  // is the ONLY data column. Force it on so the table isn't empty.
  const effectiveShowRowTotals = showRowTotals || colKeys.length === 0;
  // Symmetrically: when rows=[] the col-total row is the only data row.
  const effectiveShowColTotals = showColTotals || rowKeys.length === 0;
  const grandTotalAggregator = pivotData.getAggregator([], []);
  const cellValues: unknown[] = [];
  rowKeys.forEach((r) => colKeys.forEach((c) => cellValues.push(pivotData.getAggregator(r, c).value())));
  /** Every cell and total of the pivot written alike (`pivotCellFormat`). */
  const write = (agg: { format: (x: any) => string }, v: any) => pivotCellFormat(agg.format, cellValues)(v);

  // Prepare heatmap color functions
  let valueCellColors: (r: string[], c: string[], v: number) => { backgroundColor?: string } = () => ({});
  let rowTotalColors: (v: number) => { backgroundColor?: string } = () => ({});
  let colTotalColors: (v: number) => { backgroundColor?: string } = () => ({});

  if (heatmapMode) {
    const rowTotalValues = colKeys.map((c) => {
      const v = pivotData.getAggregator([], c).value();
      return typeof v === 'number' ? v : 0;
    });
    rowTotalColors = colorScaleGenerator(rowTotalValues);

    const colTotalValues = rowKeys.map((r) => {
      const v = pivotData.getAggregator(r, []).value();
      return typeof v === 'number' ? v : 0;
    });
    colTotalColors = colorScaleGenerator(colTotalValues);

    if (heatmapMode === 'full') {
      const allValues: number[] = [];
      rowKeys.forEach((r) =>
        colKeys.forEach((c) => {
          const v = pivotData.getAggregator(r, c).value();
          if (typeof v === 'number') allValues.push(v);
        })
      );
      const colorScale = colorScaleGenerator(allValues);
      valueCellColors = (_r, _c, v) => colorScale(v);
    } else if (heatmapMode === 'row') {
      const rowColorScales: Record<string, (v: number) => { backgroundColor: string }> = {};
      rowKeys.forEach((r) => {
        const rowValues = colKeys.map((c) => {
          const v = pivotData.getAggregator(r, c).value();
          return typeof v === 'number' ? v : 0;
        });
        rowColorScales[r.join('\0')] = colorScaleGenerator(rowValues);
      });
      valueCellColors = (r, _c, v) => rowColorScales[r.join('\0')](v);
    } else if (heatmapMode === 'col') {
      const colColorScales: Record<string, (v: number) => { backgroundColor: string }> = {};
      colKeys.forEach((c) => {
        const colValues = rowKeys.map((r) => {
          const v = pivotData.getAggregator(r, c).value();
          return typeof v === 'number' ? v : 0;
        });
        colColorScales[c.join('\0')] = colorScaleGenerator(colValues);
      });
      valueCellColors = (_r, c, v) => colColorScales[c.join('\0')](v);
    }
  }

  // Build HTML
  let html = '<table class="pvtTable">';

  // THEAD
  html += '<thead>';
  
  // Column attribute headers
  colAttrs.forEach((c, j) => {
    html += '<tr>';
    if (j === 0 && rowAttrs.length !== 0) {
      html += `<th colspan="${rowAttrs.length}" rowspan="${colAttrs.length}"></th>`;
    }
    html += `<th class="pvtAxisLabel">${escapeHtml(c)}</th>`;
    
    colKeys.forEach((colKey, i) => {
      const x = spanSize(colKeys, i, j);
      if (x !== -1) {
        const rowspan = j === colAttrs.length - 1 && rowAttrs.length !== 0 ? 2 : 1;
        html += `<th class="pvtColLabel" colspan="${x}" rowspan="${rowspan}">${escapeHtml(String(colKey[j]))}</th>`;
      }
    });
    
    if (j === 0 && showRowTotals) {
      const rowspan = colAttrs.length + (rowAttrs.length === 0 ? 0 : 1);
      html += `<th class="pvtTotalLabel" rowspan="${rowspan}">Totals</th>`;
    }
    html += '</tr>';
  });

  // Row attribute labels header
  if (rowAttrs.length !== 0) {
    html += '<tr>';
    rowAttrs.forEach((r) => {
      html += `<th class="pvtAxisLabel">${escapeHtml(r)}</th>`;
    });
    if (effectiveShowRowTotals) {
      html += `<th class="pvtTotalLabel">${colAttrs.length === 0 ? 'Totals' : ''}</th>`;
    }
    html += '</tr>';
  }
  
  html += '</thead>';

  // TBODY
  html += '<tbody>';
  
  rowKeys.forEach((rowKey, i) => {
    const totalAggregator = pivotData.getAggregator(rowKey, []);
    html += '<tr>';
    
    // Row labels
    rowKey.forEach((txt, j) => {
      const x = spanSize(rowKeys, i, j);
      if (x !== -1) {
        const colspan = j === rowAttrs.length - 1 && colAttrs.length !== 0 ? 2 : 1;
        html += `<th class="pvtRowLabel" rowspan="${x}" colspan="${colspan}">${escapeHtml(String(txt))}</th>`;
      }
    });
    
    // Data cells
    colKeys.forEach((colKey, j) => {
      const aggregator = pivotData.getAggregator(rowKey, colKey);
      const val = aggregator.value();
      const numVal = typeof val === 'number' ? val : 0;
      const style = valueCellColors(rowKey, colKey, numVal);
      const styleAttr = paintedCellStyle(style.backgroundColor);
      // Add data attributes for click handling
      const dataAttrs = options.clickable 
        ? ` data-row="${escapeHtml(JSON.stringify(rowKey))}" data-col="${escapeHtml(JSON.stringify(colKey))}" data-value="${escapeHtml(String(val))}"`
        : '';
      const clickClass = options.clickable ? ' pvtClickable' : '';
      html += `<td class="pvtVal${clickClass}"${styleAttr}${dataAttrs}>${write(aggregator, val)}</td>`;
    });
    
    // Row total (rightmost column) — suppress when showRowTotals === false.
    if (effectiveShowRowTotals) {
      const totalVal = totalAggregator.value();
      const totalNumVal = typeof totalVal === 'number' ? totalVal : 0;
      const totalStyle = colTotalColors(totalNumVal);
      const totalStyleAttr = paintedCellStyle(totalStyle.backgroundColor);
      html += `<td class="pvtTotal"${totalStyleAttr}>${write(totalAggregator, totalVal)}</td>`;
    }

    html += '</tr>';
  });

  // Grand totals row — suppress entirely when showColTotals === false.
  if (effectiveShowColTotals) {
    html += '<tr>';
    html += `<th class="pvtTotalLabel" colspan="${rowAttrs.length + (colAttrs.length === 0 ? 0 : 1)}">Totals</th>`;

    colKeys.forEach((colKey) => {
      const totalAggregator = pivotData.getAggregator([], colKey);
      const val = totalAggregator.value();
      const numVal = typeof val === 'number' ? val : 0;
      const style = rowTotalColors(numVal);
      const styleAttr = paintedCellStyle(style.backgroundColor);
      html += `<td class="pvtTotal"${styleAttr}>${write(totalAggregator, val)}</td>`;
    });

    // The grand-total cell only makes sense alongside row totals; if the user
    // suppressed row totals, don't emit the grand cell either.
    if (effectiveShowRowTotals) {
      html += `<td class="pvtGrandTotal">${write(grandTotalAggregator, grandTotalAggregator.value())}</td>`;
    }
    html += '</tr>';
  }
  
  html += '</tbody>';
  html += '</table>';

  return html;
}

/**
 * Render pivot data as TSV for export
 */
export function renderPivotTableTSV(pivotData: PivotData): string {
  const rowKeys = pivotData.getRowKeys();
  const colKeys = pivotData.getColKeys();
  
  if (rowKeys.length === 0) rowKeys.push([]);
  if (colKeys.length === 0) colKeys.push([]);

  const rows = pivotData.props.rows || [];
  const aggregatorName = pivotData.props.aggregatorName || 'Count';
  
  // Header row
  const headerRow = [...rows];
  if (colKeys.length === 1 && colKeys[0].length === 0) {
    headerRow.push(aggregatorName);
  } else {
    colKeys.forEach((c) => headerRow.push(c.join('-')));
  }

  // Data rows
  const result = [headerRow];
  rowKeys.forEach((r) => {
    const row = [...r];
    colKeys.forEach((c) => {
      const v = pivotData.getAggregator(r, c).value();
      row.push(v != null ? String(v) : '');
    });
    result.push(row);
  });

  return result.map((r) => r.join('\t')).join('\n');
}

// ============================================================================
// Chart.js Integration - Transform pivot data to Chart.js format
// ============================================================================

export type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'area';

export interface ChartRenderOptions {
  type?: ChartType;
  transpose?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
}

/**
 * Transform PivotData to Chart.js compatible data structure
 * This replaces the Plotly renderers with Chart.js format
 */
export function transformPivotDataToChartJS(
  pivotData: PivotData,
  options: ChartRenderOptions = {}
): ChartJSData {
  const { transpose = false } = options;
  
  const rowKeys = pivotData.getRowKeys();
  const colKeys = pivotData.getColKeys();
  const vals = pivotData.props.vals || [];
  const aggregatorName = pivotData.props.aggregatorName || 'Count';
  
  // Determine trace keys and datum keys based on transpose
  let traceKeys = transpose ? colKeys : rowKeys;
  let datumKeys = transpose ? rowKeys : colKeys;
  
  if (traceKeys.length === 0) traceKeys = [[]];
  if (datumKeys.length === 0) datumKeys = [[]];

  // Build full aggregator name
  let fullAggName = aggregatorName;
  const numInputs = pivotData.aggregator()?.numInputs || 0;
  if (numInputs !== 0 && vals.length > 0) {
    fullAggName += ` of ${vals.slice(0, numInputs).join(', ')}`;
  }

  // Labels for X-axis
  const labels = datumKeys.map((dk) => dk.join('-') || fullAggName);

  // Datasets
  const datasets: ChartJSDataset[] = traceKeys.map((traceKey) => {
    const data = datumKeys.map((datumKey) => {
      const val = parseFloat(
        String(pivotData.getAggregator(
          transpose ? datumKey : traceKey,
          transpose ? traceKey : datumKey
        ).value())
      );
      return isFinite(val) ? val : null;
    });

    return {
      label: traceKey.join('-') || fullAggName,
      data,
    };
  });

  return { labels, datasets };
}

/**
 * Get Chart.js config for different chart types
 * Maps Plotly renderer names to Chart.js configurations
 */
export function getChartConfigForRenderer(
  rendererName: string,
  pivotData: PivotData
): { type: string; data: ChartJSData; options: any } {
  const rendererConfigs: Record<string, ChartRenderOptions & { chartType: string; chartOptions?: any }> = {
    'Grouped Column Chart': { chartType: 'bar', transpose: false },
    'Stacked Column Chart': { chartType: 'bar', transpose: false, stacked: true },
    'Grouped Bar Chart': { chartType: 'bar', transpose: true, horizontal: true },
    'Stacked Bar Chart': { chartType: 'bar', transpose: true, horizontal: true, stacked: true },
    'Line Chart': { chartType: 'line', transpose: false },
    'Dot Chart': { chartType: 'scatter', transpose: true, chartOptions: { pointOnly: true } },
    'Area Chart': { chartType: 'line', transpose: false, chartOptions: { fill: true } },
    'Scatter Chart': { chartType: 'scatter', transpose: false },
    'Pie Chart': { chartType: 'pie', transpose: true },
    'Doughnut Chart': { chartType: 'doughnut', transpose: true },
  };

  const config = rendererConfigs[rendererName] || { chartType: 'bar', transpose: false };
  const chartData = transformPivotDataToChartJS(pivotData, { transpose: config.transpose });

  // Build Chart.js options
  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
  };

  if (config.stacked) {
    chartOptions.scales = {
      x: { stacked: true },
      y: { stacked: true },
    };
  }

  if (config.horizontal) {
    chartOptions.indexAxis = 'y';
  }

  // Apply any additional chart options
  if (config.chartOptions) {
    // For area chart, set fill on datasets
    if (config.chartOptions.fill) {
      chartData.datasets.forEach((ds) => {
        (ds as any).fill = true;
      });
    }
  }

  return {
    type: config.chartType,
    data: chartData,
    options: chartOptions,
  };
}

// ============================================================================
// Renderer Registry
// ============================================================================

export type RendererType = 'table' | 'chart';

export interface RendererInfo {
  name: string;
  type: RendererType;
  heatmapMode?: HeatmapMode;
}

export const renderers: Record<string, RendererInfo> = {
  'Table': { name: 'Table', type: 'table' },
  'Table Heatmap': { name: 'Table Heatmap', type: 'table', heatmapMode: 'full' },
  'Table Col Heatmap': { name: 'Table Col Heatmap', type: 'table', heatmapMode: 'col' },
  'Table Row Heatmap': { name: 'Table Row Heatmap', type: 'table', heatmapMode: 'row' },
  'Grouped Column Chart': { name: 'Grouped Column Chart', type: 'chart' },
  'Stacked Column Chart': { name: 'Stacked Column Chart', type: 'chart' },
  'Grouped Bar Chart': { name: 'Grouped Bar Chart', type: 'chart' },
  'Stacked Bar Chart': { name: 'Stacked Bar Chart', type: 'chart' },
  'Line Chart': { name: 'Line Chart', type: 'chart' },
  'Dot Chart': { name: 'Dot Chart', type: 'chart' },
  'Area Chart': { name: 'Area Chart', type: 'chart' },
  'Scatter Chart': { name: 'Scatter Chart', type: 'chart' },
  'Pie Chart': { name: 'Pie Chart', type: 'chart' },
  'Doughnut Chart': { name: 'Doughnut Chart', type: 'chart' },
};

export const rendererNames = Object.keys(renderers);
export const tableRendererNames = rendererNames.filter((n) => renderers[n].type === 'table');
export const chartRendererNames = rendererNames.filter((n) => renderers[n].type === 'chart');

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

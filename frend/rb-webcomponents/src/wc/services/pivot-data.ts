/**
 * PivotData - Core pivot table data engine
 * Ported from react-pivottable/Utilities.js (pure JS, framework-agnostic)
 */

import type {
  PivotDataProps,
  AggregatorFactory,
  AggregatorInstance,
  Aggregator,
  Sorter,
  NumberFormatOptions,
  LocaleStrings,
  Locale,
  ValueFilter,
  SortOrder,
} from './pivot-types';

// ============================================================================
// Number formatting utilities
// ============================================================================

const addSeparators = (nStr: string, thousandsSep: string, decimalSep: string): string => {
  const x = String(nStr).split('.');
  let x1 = x[0];
  const x2 = x.length > 1 ? decimalSep + x[1] : '';
  const rgx = /(\d+)(\d{3})/;
  while (rgx.test(x1)) {
    x1 = x1.replace(rgx, `$1${thousandsSep}$2`);
  }
  return x1 + x2;
};

export const numberFormat = (opts_in: NumberFormatOptions = {}): ((x: number) => string) => {
  const defaults: NumberFormatOptions = {
    digitsAfterDecimal: 2,
    scaler: 1,
    thousandsSep: ',',
    decimalSep: '.',
    prefix: '',
    suffix: '',
  };
  const opts = { ...defaults, ...opts_in };
  return (x: number): string => {
    if (isNaN(x) || !isFinite(x)) {
      return '';
    }
    const result = addSeparators(
      ((opts.scaler ?? 1) * x).toFixed(opts.digitsAfterDecimal ?? 2),
      opts.thousandsSep ?? ',',
      opts.decimalSep ?? '.'
    );
    return `${opts.prefix ?? ''}${result}${opts.suffix ?? ''}`;
  };
};

// ============================================================================
// Natural sorting algorithm
// ============================================================================

const rx = /(\d+)|(\D+)/g;
const rd = /\d/;
const rz = /^0/;

export const naturalSort: Sorter = (as: any, bs: any): number => {
  // nulls first
  if (bs !== null && as === null) return -1;
  if (as !== null && bs === null) return 1;

  // then raw NaNs
  if (typeof as === 'number' && isNaN(as)) return -1;
  if (typeof bs === 'number' && isNaN(bs)) return 1;

  // numbers and numbery strings group together
  const nas = Number(as);
  const nbs = Number(bs);
  if (nas < nbs) return -1;
  if (nas > nbs) return 1;

  // within that, true numbers before numbery strings
  if (typeof as === 'number' && typeof bs !== 'number') return -1;
  if (typeof bs === 'number' && typeof as !== 'number') return 1;
  if (typeof as === 'number' && typeof bs === 'number') return 0;

  // 'Infinity' is a textual number, so less than 'A'
  if (isNaN(nbs) && !isNaN(nas)) return -1;
  if (isNaN(nas) && !isNaN(nbs)) return 1;

  // finally, "smart" string sorting
  let a = String(as);
  let b = String(bs);
  if (a === b) return 0;
  if (!rd.test(a) || !rd.test(b)) return a > b ? 1 : -1;

  // special treatment for strings containing digits
  const aArr = a.match(rx) || [];
  const bArr = b.match(rx) || [];
  while (aArr.length && bArr.length) {
    const a1 = aArr.shift()!;
    const b1 = bArr.shift()!;
    if (a1 !== b1) {
      if (rd.test(a1) && rd.test(b1)) {
        return parseFloat(a1.replace(rz, '.0')) - parseFloat(b1.replace(rz, '.0'));
      }
      return a1 > b1 ? 1 : -1;
    }
  }
  return aArr.length - bArr.length;
};

// ============================================================================
// Sort utilities
// ============================================================================

export const sortAs = (order: any[]): Sorter => {
  const mapping: Record<string, number> = {};
  const l_mapping: Record<string, number> = {};
  
  for (let i = 0; i < order.length; i++) {
    const x = order[i];
    mapping[x] = i;
    if (typeof x === 'string') {
      l_mapping[x.toLowerCase()] = i;
    }
  }
  
  return (a: any, b: any): number => {
    if (a in mapping && b in mapping) {
      return mapping[a] - mapping[b];
    } else if (a in mapping) {
      return -1;
    } else if (b in mapping) {
      return 1;
    } else if (a in l_mapping && b in l_mapping) {
      return l_mapping[a] - l_mapping[b];
    } else if (a in l_mapping) {
      return -1;
    } else if (b in l_mapping) {
      return 1;
    }
    return naturalSort(a, b);
  };
};

export const getSort = (sorters: any, attr: string): Sorter => {
  if (sorters) {
    if (typeof sorters === 'function') {
      const sort = sorters(attr);
      if (typeof sort === 'function') return sort;
    } else if (attr in sorters) {
      return sorters[attr];
    }
  }
  return naturalSort;
};

// ============================================================================
// Number formatters
// ============================================================================

export const usFmt = numberFormat();
export const usFmtInt = numberFormat({ digitsAfterDecimal: 0 });
export const usFmtPct = numberFormat({
  digitsAfterDecimal: 1,
  scaler: 100,
  suffix: '%',
});

// ============================================================================
// Aggregator Templates - Core pivot table algorithms
// ============================================================================

export const aggregatorTemplates = {
  count(formatter = usFmtInt): AggregatorFactory {
    return () =>
      (): AggregatorInstance => ({
        count: 0,
        push() { (this as any).count++; },
        value() { return (this as any).count; },
        format: formatter,
      });
  },

  uniques(fn: (arr: any[]) => any, formatter = usFmtInt): AggregatorFactory {
    return ([attr]: string[]) =>
      (): AggregatorInstance => ({
        uniq: [] as any[],
        push(record: Record<string, any>) {
          if (!(this as any).uniq.includes(record[attr])) {
            (this as any).uniq.push(record[attr]);
          }
        },
        value() { return fn((this as any).uniq); },
        format: formatter,
        numInputs: typeof attr !== 'undefined' ? 0 : 1,
      });
  },

  sum(formatter = usFmt): AggregatorFactory {
    return ([attr]: string[]) =>
      (): AggregatorInstance => ({
        sum: 0,
        push(record: Record<string, any>) {
          if (!isNaN(parseFloat(record[attr]))) {
            (this as any).sum += parseFloat(record[attr]);
          }
        },
        value() { return (this as any).sum; },
        format: formatter,
        numInputs: typeof attr !== 'undefined' ? 0 : 1,
      });
  },

  extremes(mode: 'min' | 'max' | 'first' | 'last', formatter = usFmt): AggregatorFactory {
    return ([attr]: string[]) =>
      (data?: any): AggregatorInstance => ({
        val: null as any,
        sorter: getSort(data?.sorters, attr),
        push(record: Record<string, any>) {
          let x: any = record[attr];
          if (['min', 'max'].includes(mode)) {
            x = parseFloat(x);
            if (!isNaN(x)) {
              const self = this as any;
              self.val = Math[mode as 'min' | 'max'](x, self.val !== null ? self.val : x);
            }
          }
          if (mode === 'first') {
            const self = this as any;
            if (self.sorter(x, self.val !== null ? self.val : x) <= 0) {
              self.val = x;
            }
          }
          if (mode === 'last') {
            const self = this as any;
            if (self.sorter(x, self.val !== null ? self.val : x) >= 0) {
              self.val = x;
            }
          }
        },
        value() { return (this as any).val; },
        format(x: any) { return isNaN(x) ? x : formatter(x); },
        numInputs: typeof attr !== 'undefined' ? 0 : 1,
      });
  },

  quantile(q: number, formatter = usFmt): AggregatorFactory {
    return ([attr]: string[]) =>
      (): AggregatorInstance => ({
        vals: [] as number[],
        push(record: Record<string, any>) {
          const x = parseFloat(record[attr]);
          if (!isNaN(x)) (this as any).vals.push(x);
        },
        value() {
          const self = this as any;
          if (self.vals.length === 0) return null;
          self.vals.sort((a: number, b: number) => a - b);
          const i = (self.vals.length - 1) * q;
          return (self.vals[Math.floor(i)] + self.vals[Math.ceil(i)]) / 2.0;
        },
        format: formatter,
        numInputs: typeof attr !== 'undefined' ? 0 : 1,
      });
  },

  runningStat(mode: 'mean' | 'var' | 'stdev' = 'mean', ddof = 1, formatter = usFmt): AggregatorFactory {
    return ([attr]: string[]) =>
      (): AggregatorInstance => ({
        n: 0,
        m: 0,
        s: 0,
        push(record: Record<string, any>) {
          const x = parseFloat(record[attr]);
          if (isNaN(x)) return;
          const self = this as any;
          self.n += 1.0;
          if (self.n === 1.0) self.m = x;
          const m_new = self.m + (x - self.m) / self.n;
          self.s = self.s + (x - self.m) * (x - m_new);
          self.m = m_new;
        },
        value() {
          const self = this as any;
          if (mode === 'mean') {
            return self.n === 0 ? NaN : self.m;
          }
          if (self.n <= ddof) return 0;
          switch (mode) {
            case 'var': return self.s / (self.n - ddof);
            case 'stdev': return Math.sqrt(self.s / (self.n - ddof));
            default: throw new Error('unknown mode for runningStat');
          }
        },
        format: formatter,
        numInputs: typeof attr !== 'undefined' ? 0 : 1,
      });
  },

  sumOverSum(formatter = usFmt): AggregatorFactory {
    return ([num, denom]: string[]) =>
      (): AggregatorInstance => ({
        sumNum: 0,
        sumDenom: 0,
        push(record: Record<string, any>) {
          const self = this as any;
          if (!isNaN(parseFloat(record[num]))) self.sumNum += parseFloat(record[num]);
          if (!isNaN(parseFloat(record[denom]))) self.sumDenom += parseFloat(record[denom]);
        },
        value() {
          const self = this as any;
          return self.sumNum / self.sumDenom;
        },
        format: formatter,
        numInputs: typeof num !== 'undefined' && typeof denom !== 'undefined' ? 0 : 2,
      });
  },

  fractionOf(wrapped: AggregatorFactory, type: 'total' | 'row' | 'col' = 'total', formatter = usFmtPct): AggregatorFactory {
    return (x: string[]) =>
      (data?: any, rowKey?: string[], colKey?: string[]): AggregatorInstance => ({
        selector: { total: [[], []], row: [rowKey || [], []], col: [[], colKey || []] }[type],
        inner: wrapped(x)(data, rowKey, colKey),
        push(record: Record<string, any>) { (this as any).inner.push(record); },
        format: formatter,
        value() {
          const self = this as any;
          return self.inner.value() / data.getAggregator(...self.selector).inner.value();
        },
        numInputs: wrapped(x)().numInputs,
      });
  },

  // Shorthand aliases
  countUnique(f = usFmtInt): AggregatorFactory {
    return aggregatorTemplates.uniques((x) => x.length, f);
  },
  listUnique(s = ', '): AggregatorFactory {
    return aggregatorTemplates.uniques((x) => x.join(s), (x: any) => String(x));
  },
  max(f = usFmt): AggregatorFactory { return aggregatorTemplates.extremes('max', f); },
  min(f = usFmt): AggregatorFactory { return aggregatorTemplates.extremes('min', f); },
  first(f = usFmt): AggregatorFactory { return aggregatorTemplates.extremes('first', f); },
  last(f = usFmt): AggregatorFactory { return aggregatorTemplates.extremes('last', f); },
  median(f = usFmt): AggregatorFactory { return aggregatorTemplates.quantile(0.5, f); },
  average(f = usFmt): AggregatorFactory { return aggregatorTemplates.runningStat('mean', 1, f); },
  var(ddof = 1, f = usFmt): AggregatorFactory { return aggregatorTemplates.runningStat('var', ddof, f); },
  stdev(ddof = 1, f = usFmt): AggregatorFactory { return aggregatorTemplates.runningStat('stdev', ddof, f); },
};

// ============================================================================
// Default aggregators registry
// ============================================================================

export const aggregators: Record<string, AggregatorFactory> = {
  'Count': aggregatorTemplates.count(usFmtInt),
  'Count Unique Values': aggregatorTemplates.countUnique(usFmtInt),
  'List Unique Values': aggregatorTemplates.listUnique(', '),
  'Sum': aggregatorTemplates.sum(usFmt),
  'Integer Sum': aggregatorTemplates.sum(usFmtInt),
  'Average': aggregatorTemplates.average(usFmt),
  'Median': aggregatorTemplates.median(usFmt),
  'Sample Variance': aggregatorTemplates.var(1, usFmt),
  'Sample Standard Deviation': aggregatorTemplates.stdev(1, usFmt),
  'Minimum': aggregatorTemplates.min(usFmt),
  'Maximum': aggregatorTemplates.max(usFmt),
  'First': aggregatorTemplates.first(usFmt),
  'Last': aggregatorTemplates.last(usFmt),
  'Sum over Sum': aggregatorTemplates.sumOverSum(usFmt),
  'Sum as Fraction of Total': aggregatorTemplates.fractionOf(aggregatorTemplates.sum(), 'total', usFmtPct),
  'Sum as Fraction of Rows': aggregatorTemplates.fractionOf(aggregatorTemplates.sum(), 'row', usFmtPct),
  'Sum as Fraction of Columns': aggregatorTemplates.fractionOf(aggregatorTemplates.sum(), 'col', usFmtPct),
  'Count as Fraction of Total': aggregatorTemplates.fractionOf(aggregatorTemplates.count(), 'total', usFmtPct),
  'Count as Fraction of Rows': aggregatorTemplates.fractionOf(aggregatorTemplates.count(), 'row', usFmtPct),
  'Count as Fraction of Columns': aggregatorTemplates.fractionOf(aggregatorTemplates.count(), 'col', usFmtPct),
};

// ============================================================================
// Locales
// ============================================================================

export const locales: Record<string, Locale> = {
  en: {
    aggregators,
    localeStrings: {
      renderError: 'An error occurred rendering the PivotTable results.',
      computeError: 'An error occurred computing the PivotTable results.',
      uiRenderError: 'An error occurred rendering the PivotTable UI.',
      selectAll: 'Select All',
      selectNone: 'Select None',
      tooMany: '(too many to list)',
      filterResults: 'Filter values',
      apply: 'Apply',
      cancel: 'Cancel',
      totals: 'Totals',
      vs: 'vs',
      by: 'by',
    },
  },
};

// ============================================================================
// Date derivers
// ============================================================================

const mthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const zeroPad = (n: number): string => `0${n}`.slice(-2);

export const derivers = {
  bin(col: string, binWidth: number) {
    return (record: Record<string, any>) => record[col] - (record[col] % binWidth);
  },
  dateFormat(
    col: string,
    formatString: string,
    utcOutput = false,
    mthNames = mthNamesEn,
    dayNames = dayNamesEn
  ) {
    const utc = utcOutput ? 'UTC' : '';
    return (record: Record<string, any>): string => {
      const date = new Date(Date.parse(record[col]));
      if (isNaN(date.getTime())) return '';
      return formatString.replace(/%(.)/g, (m: string, p: string): string => {
        switch (p) {
          case 'y': return String((date as any)[`get${utc}FullYear`]());
          case 'm': return zeroPad((date as any)[`get${utc}Month`]() + 1);
          case 'n': return mthNames[(date as any)[`get${utc}Month`]()];
          case 'd': return zeroPad((date as any)[`get${utc}Date`]());
          case 'w': return dayNames[(date as any)[`get${utc}Day`]()];
          case 'x': return String((date as any)[`get${utc}Day`]());
          case 'H': return zeroPad((date as any)[`get${utc}Hours`]());
          case 'M': return zeroPad((date as any)[`get${utc}Minutes`]());
          case 'S': return zeroPad((date as any)[`get${utc}Seconds`]());
          default: return `%${p}`;
        }
      });
    };
  },
};

// ============================================================================
// PivotData class - THE CORE ENGINE
// ============================================================================

export class PivotData {
  props: PivotDataProps & { aggregators: Record<string, AggregatorFactory> };
  aggregator: Aggregator;
  tree: Record<string, Record<string, AggregatorInstance>>;
  rowKeys: string[][];
  colKeys: string[][];
  rowTotals: Record<string, AggregatorInstance>;
  colTotals: Record<string, AggregatorInstance>;
  allTotal: AggregatorInstance;
  sorted: boolean;

  static defaultProps: PivotDataProps & { aggregators: Record<string, AggregatorFactory> } = {
    data: [],
    aggregators,
    cols: [],
    rows: [],
    vals: [],
    aggregatorName: 'Count',
    sorters: {},
    valueFilter: {},
    rowOrder: 'key_a_to_z',
    colOrder: 'key_a_to_z',
    derivedAttributes: {},
  };

  constructor(inputProps: PivotDataProps = {}) {
    this.props = { ...PivotData.defaultProps, ...inputProps };
    
    const aggregatorFactory = this.props.aggregators[this.props.aggregatorName || 'Count'];
    this.aggregator = aggregatorFactory(this.props.vals || []);
    
    this.tree = {};
    this.rowKeys = [];
    this.colKeys = [];
    this.rowTotals = {};
    this.colTotals = {};
    this.allTotal = this.aggregator(this as any, [], []);
    this.sorted = false;

    // iterate through input, accumulating data for cells
    PivotData.forEachRecord(
      this.props.data,
      this.props.derivedAttributes || {},
      (record) => {
        if (this.filter(record)) {
          this.processRecord(record);
        }
      }
    );
  }

  filter(record: Record<string, any>): boolean {
    const valueFilter = this.props.valueFilter || {};
    for (const k in valueFilter) {
      if (record[k] in valueFilter[k]) {
        return false;
      }
    }
    return true;
  }

  forEachMatchingRecord(criteria: Record<string, any>, callback: (record: Record<string, any>) => void): void {
    PivotData.forEachRecord(
      this.props.data,
      this.props.derivedAttributes || {},
      (record) => {
        if (!this.filter(record)) return;
        for (const k in criteria) {
          const v = criteria[k];
          if (v !== (k in record ? record[k] : 'null')) return;
        }
        callback(record);
      }
    );
  }

  arrSort(attrs: string[]): Sorter {
    const sortersArr = attrs.map((a) => getSort(this.props.sorters, a));
    return (a: any[], b: any[]): number => {
      for (let i = 0; i < sortersArr.length; i++) {
        const comparison = sortersArr[i](a[i], b[i]);
        if (comparison !== 0) return comparison;
      }
      return 0;
    };
  }

  sortKeys(): void {
    if (this.sorted) return;
    this.sorted = true;

    const v = (r: string[], c: string[]) => this.getAggregator(r, c).value();

    switch (this.props.rowOrder) {
      case 'value_a_to_z':
        this.rowKeys.sort((a, b) => naturalSort(v(a, []), v(b, [])));
        break;
      case 'value_z_to_a':
        this.rowKeys.sort((a, b) => -naturalSort(v(a, []), v(b, [])));
        break;
      case 'key_z_to_a': {
        const byKey = this.arrSort(this.props.rows || []);
        this.rowKeys.sort((a, b) => -byKey(a, b));
        break;
      }
      default:
        this.rowKeys.sort(this.arrSort(this.props.rows || []));
    }

    switch (this.props.colOrder) {
      case 'value_a_to_z':
        this.colKeys.sort((a, b) => naturalSort(v([], a), v([], b)));
        break;
      case 'value_z_to_a':
        this.colKeys.sort((a, b) => -naturalSort(v([], a), v([], b)));
        break;
      case 'key_z_to_a': {
        const byKey = this.arrSort(this.props.cols || []);
        this.colKeys.sort((a, b) => -byKey(a, b));
        break;
      }
      default:
        this.colKeys.sort(this.arrSort(this.props.cols || []));
    }
  }

  getColKeys(): string[][] {
    this.sortKeys();
    return this.colKeys;
  }

  getRowKeys(): string[][] {
    this.sortKeys();
    return this.rowKeys;
  }

  processRecord(record: Record<string, any>): void {
    const colKey: string[] = [];
    const rowKey: string[] = [];
    
    for (const x of (this.props.cols || [])) {
      colKey.push(x in record ? record[x] : 'null');
    }
    for (const x of (this.props.rows || [])) {
      rowKey.push(x in record ? record[x] : 'null');
    }
    
    const flatRowKey = rowKey.join(String.fromCharCode(0));
    const flatColKey = colKey.join(String.fromCharCode(0));

    this.allTotal.push(record);

    if (rowKey.length !== 0) {
      if (!this.rowTotals[flatRowKey]) {
        this.rowKeys.push(rowKey);
        this.rowTotals[flatRowKey] = this.aggregator(this as any, rowKey, []);
      }
      this.rowTotals[flatRowKey].push(record);
    }

    if (colKey.length !== 0) {
      if (!this.colTotals[flatColKey]) {
        this.colKeys.push(colKey);
        this.colTotals[flatColKey] = this.aggregator(this as any, [], colKey);
      }
      this.colTotals[flatColKey].push(record);
    }

    if (colKey.length !== 0 && rowKey.length !== 0) {
      if (!this.tree[flatRowKey]) {
        this.tree[flatRowKey] = {};
      }
      if (!this.tree[flatRowKey][flatColKey]) {
        this.tree[flatRowKey][flatColKey] = this.aggregator(this as any, rowKey, colKey);
      }
      this.tree[flatRowKey][flatColKey].push(record);
    }
  }

  getAggregator(rowKey: string[], colKey: string[]): AggregatorInstance {
    const flatRowKey = rowKey.join(String.fromCharCode(0));
    const flatColKey = colKey.join(String.fromCharCode(0));
    
    let agg: AggregatorInstance | undefined;
    
    if (rowKey.length === 0 && colKey.length === 0) {
      agg = this.allTotal;
    } else if (rowKey.length === 0) {
      agg = this.colTotals[flatColKey];
    } else if (colKey.length === 0) {
      agg = this.rowTotals[flatRowKey];
    } else {
      agg = this.tree[flatRowKey]?.[flatColKey];
    }
    
    return agg || {
      value() { return null; },
      format() { return ''; },
      push() {},
    };
  }

  // Static method to iterate records
  static forEachRecord(
    input: any,
    derivedAttributes: Record<string, (record: Record<string, any>) => any>,
    f: (record: Record<string, any>) => void
  ): void {
    let addRecord: (record: Record<string, any>) => void;
    
    if (Object.keys(derivedAttributes).length === 0) {
      addRecord = f;
    } else {
      addRecord = (record: Record<string, any>) => {
        for (const k in derivedAttributes) {
          const derived = derivedAttributes[k](record);
          if (derived !== null) {
            record[k] = derived;
          }
        }
        f(record);
      };
    }

    // if it's a function, have it call us back
    if (typeof input === 'function') {
      input(addRecord);
      return;
    }
    
    if (Array.isArray(input)) {
      if (input.length === 0) return;
      
      if (Array.isArray(input[0])) {
        // array of arrays - first row is headers
        const headers = input[0] as string[];
        for (let i = 1; i < input.length; i++) {
          const compactRecord = input[i] as any[];
          const record: Record<string, any> = {};
          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = compactRecord[j];
          }
          addRecord(record);
        }
      } else {
        // array of objects
        for (const record of input) {
          addRecord(record);
        }
      }
      return;
    }
    
    throw new Error('unknown input format');
  }
}

// Export all
export { PivotData as default };

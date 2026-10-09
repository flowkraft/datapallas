// The 25 recipes, imported statically: the spec reads one by the key its number and id make,
// and a static import is something Playwright's TypeScript transform reaches (a `require` of a
// computed path is not, and Node then reads the `.ts` file as JavaScript).
import type { Recipe } from '../../helpers/dashboard-demos/recipe';

import { recipe as r01 } from './01-dd-executive-overview.recipe';
import { recipe as r02 } from './02-dd-sales-overview.recipe';
import { recipe as r03 } from './03-dd-sales-by-country.recipe';
import { recipe as r04 } from './04-dd-sales-channels.recipe';
import { recipe as r05 } from './05-dd-product-performance.recipe';
import { recipe as r06 } from './06-dd-seasonality.recipe';
import { recipe as r07 } from './07-dd-sales-pipeline.recipe';
import { recipe as r08 } from './08-dd-targets-vs-actual.recipe';
import { recipe as r09 } from './09-dd-customer-growth.recipe';
import { recipe as r10 } from './10-dd-cohort-retention.recipe';
import { recipe as r11 } from './11-dd-customer-360.recipe';
import { recipe as r12 } from './12-dd-web-funnel.recipe';
import { recipe as r13 } from './13-dd-invoices.recipe';
import { recipe as r14 } from './14-dd-receivables-aging.recipe';
import { recipe as r15 } from './15-dd-subscriptions-mrr.recipe';
import { recipe as r16 } from './16-dd-profit-margin.recipe';
import { recipe as r17 } from './17-dd-payroll.recipe';
import { recipe as r18 } from './18-dd-headcount.recipe';
import { recipe as r19 } from './19-dd-inventory.recipe';
import { recipe as r20 } from './20-dd-fulfillment.recipe';
import { recipe as r21 } from './21-dd-support-operations.recipe';
import { recipe as r22 } from './22-dd-support-quality.recipe';
import { recipe as r23 } from './23-dd-table-profile.recipe';
import { recipe as r24 } from './24-dd-metric-deep-dive.recipe';
import { recipe as r25 } from './25-dd-segment-vs-all.recipe';

/** Recipe by `<nn>-<id>`, e.g. `01-dd-executive-overview`. */
export const RECIPES: Record<string, Recipe> = {
  '01-dd-executive-overview': r01,
  '02-dd-sales-overview': r02,
  '03-dd-sales-by-country': r03,
  '04-dd-sales-channels': r04,
  '05-dd-product-performance': r05,
  '06-dd-seasonality': r06,
  '07-dd-sales-pipeline': r07,
  '08-dd-targets-vs-actual': r08,
  '09-dd-customer-growth': r09,
  '10-dd-cohort-retention': r10,
  '11-dd-customer-360': r11,
  '12-dd-web-funnel': r12,
  '13-dd-invoices': r13,
  '14-dd-receivables-aging': r14,
  '15-dd-subscriptions-mrr': r15,
  '16-dd-profit-margin': r16,
  '17-dd-payroll': r17,
  '18-dd-headcount': r18,
  '19-dd-inventory': r19,
  '20-dd-fulfillment': r20,
  '21-dd-support-operations': r21,
  '22-dd-support-quality': r22,
  '23-dd-table-profile': r23,
  '24-dd-metric-deep-dive': r24,
  '25-dd-segment-vs-all': r25,
};

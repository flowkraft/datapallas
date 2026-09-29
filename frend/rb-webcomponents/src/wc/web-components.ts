// Import your web component Svelte files
import RbTabulator from "./RbTabulator.wc.svelte";
import RbChart from "./RbChart.wc.svelte";
import RbPivotTable from "./RbPivotTable.wc.svelte";
import RbParameters from "./RbParameters.wc.svelte";
import RbReport from "./RbReport.wc.svelte";
import RbValue from "./RbValue.wc.svelte";
import RbFilterPane from "./RbFilterPane.wc.svelte";
import RbCubeRenderer from "./RbCubeRenderer.wc.svelte";
import RbMap from "./RbMap.wc.svelte";
import RbSankey from "./RbSankey.wc.svelte";
import RbGauge from "./RbGauge.wc.svelte";
import RbTrend from "./RbTrend.wc.svelte";
import RbProgress from "./RbProgress.wc.svelte";
import RbDetail from "./RbDetail.wc.svelte";
// One database picker for a whole page of cubes, in its header (D11).
import RbSqlVendor from "./RbSqlVendor.wc.svelte";

// Export them so they can be imported elsewhere if desired
export { RbTabulator, RbChart, RbPivotTable, RbParameters, RbReport, RbValue, RbFilterPane, RbCubeRenderer, RbMap, RbSankey, RbGauge, RbTrend, RbProgress, RbDetail, RbSqlVendor };

// rb-dashboard is a semantic alias for rb-report
const RbReportClass = customElements.get('rb-report');
if (RbReportClass && !customElements.get('rb-dashboard')) {
  customElements.define('rb-dashboard', class extends RbReportClass {});
}

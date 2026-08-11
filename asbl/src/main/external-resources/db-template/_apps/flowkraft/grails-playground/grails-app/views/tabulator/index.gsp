<%@ page import="flowkraft.frend.RbUtils" %>
<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Data Tables - DataPallas</title>
    <style>
        rb-tabulator { display: block; width: 100%; }
        .example-card {
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            margin-bottom: 1.5rem;
            overflow: hidden;
            padding: 1rem;
        }
        .example-title { margin: 0 0 0.25rem 0; font-weight: 600; font-size: 0.95rem; }
        .example-desc { color: color-mix(in oklab, var(--color-base-content) 60%, transparent); font-size: 0.85rem; margin: 0 0 1rem 0; }
        .category-header {
            font-size: 1.1rem;
            font-weight: 700;
            margin: 2rem 0 1rem 0;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--color-primary, #06b6d4);
        }
        .code-block {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.85rem;
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
            color: #d4d4d4;
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            white-space: pre;
            line-height: 1.5;
            border: 1px solid #3d3d3d;
            max-height: 600px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="mt-4">
            <div class="w-full">
                <h4 class="mb-2">Data Tables</h4>
                <p class="text-base-content/60 mb-4">Interactive data tables powered by <code>&lt;rb-tabulator&gt;</code>.</p>

                <!-- daisyUI Tabs -->
                <div class="tabs tabs-bordered" id="pageTabs">
                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Examples" id="examples-tab" checked/>
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="examples-pane">

                        <h5 class="category-header">Layout</h5>

                        <g:render template="example" model="[id: 'virtualDomVertical', title: 'Virtual DOM - Vertical', desc: 'The table engine employs a virtual rendering strategy: only the rows currently in the viewport (plus a small buffer) are mounted in the DOM. As you scroll, rows are created and recycled on the fly. This table contains 200 rows but never renders more than a handful at once.']" />
                        <g:render template="example" model="[id: 'virtualDomHorizontal', title: 'Virtual DOM - Horizontal', desc: 'When a table has many columns, horizontal virtual rendering can be enabled so that only the visible columns are kept in the DOM. Scroll sideways through this 100-column table to see columns appear and disappear dynamically.']" />
                        <g:render template="example" model="[id: 'fitToData', title: 'Fit To Data', desc: 'Each column automatically adjusts its width to match the widest cell content, keeping the table as compact as possible.']" />
                        <g:render template="example" model="[id: 'fitToDataAndFill', title: 'Fit To Data and Fill', desc: 'Columns size themselves to their content first, then the remaining horizontal space is distributed so that every row spans the full table width.']" />
                        <g:render template="example" model="[id: 'fitToDataAndStretchLastColumn', title: 'Fit To Data and Stretch Last Column', desc: 'Columns size themselves to their content, and the last column stretches to fill whatever space remains, ensuring a clean right edge.']" />
                        <g:render template="example" model="[id: 'fitTableAndColumnsToData', title: 'Fit Table and Columns to Data', desc: 'Both the table container and individual columns adapt their dimensions to the data, so the overall table is only as wide and tall as needed.']" />
                        <g:render template="example" model="[id: 'fitToWidth', title: 'Fit To Width', desc: 'Columns distribute themselves proportionally across the available container width. Columns without an explicit width grow or shrink according to their widthGrow and widthShrink settings, ensuring the table always fills its parent exactly.']" />
                        <g:render template="example" model="[id: 'responsiveLayout', title: 'Responsive Layout', desc: 'When the viewport narrows, lower-priority columns are hidden automatically so the remaining columns never overflow the container. Resize your browser window to watch columns appear and disappear in real time.']" />
                        <g:render template="example" model="[id: 'responsiveLayoutCollapsedList', title: 'Responsive Collapse', desc: 'Instead of hiding overflow columns entirely, this mode folds them into an expandable detail list beneath each row. A toggle in the row header lets users show or hide the collapsed content. Try resizing the window to see columns move in and out of the detail list.']" />
                        <g:render template="example" model="[id: 'automaticColumnGeneration', title: 'Auto-Generated Columns', desc: 'When no explicit column definitions are provided, the table inspects the first data row and generates columns automatically — useful for quick previews of unknown datasets.']" />
                        <g:render template="example" model="[id: 'resizableColumns', title: 'Column Resizing', desc: 'Drag the right edge of any column header to adjust its width. Per-column control over resizability is available, and a fit mode can make a neighbouring column shrink as you enlarge another, keeping the total width constant.']" />
                        <g:render template="example" model="[id: 'resizeGuides', title: 'Resize Guides', desc: 'While dragging a column or row edge, a visual guide line follows the cursor so you can see the new size before releasing the mouse.']" />
                        <g:render template="example" model="[id: 'columnGroups', title: 'Grouped Column Headers', desc: 'Columns can be nested inside parent groups to create multi-level headers, making it easy to organise related fields under a shared label.']" />
                        <g:render template="example" model="[id: 'verticalColumnHeaders', title: 'Vertical Header Text', desc: 'Header text can be rotated vertically, which is handy when you need many narrow columns and horizontal labels would be too wide.']" />
                        <g:render template="example" model="[id: 'rowHeader', title: 'Row Header', desc: 'A dedicated header column can be pinned to the left edge of the table, independent of the main data columns — commonly used for row numbers or selection checkboxes.']" />
                        <g:render template="example" model="[id: 'frozenColumns', title: 'Pinned Columns', desc: 'Mark specific columns as frozen so they stay fixed in place while the rest of the table scrolls horizontally.']" />
                        <g:render template="example" model="[id: 'frozenRows', title: 'Pinned Rows', desc: 'A set number of rows at the top of the table can be pinned so they remain visible as you scroll through the rest of the data.']" />
                        <g:render template="example" model="[id: 'nestedDataTrees', title: 'Tree View', desc: 'Hierarchical data can be displayed as an expandable tree. Child rows are indented beneath their parent, and a toggle control lets users collapse or expand each branch.']" />
                        <g:render template="example" model="[id: 'formatters', title: 'Cell Formatters', desc: 'Cell values can be rendered visually using built-in formatters such as progress bars, star ratings, tick/cross icons, row numbers, colour swatches, and action buttons — giving the table a richer, more informative appearance.']" />
                        <g:render template="example" model="[id: 'persistentConfiguration', title: 'Saved Layout', desc: 'Column widths, ordering, and sort state are saved to local storage automatically. Try resizing or rearranging the columns below, then refresh the page — your layout will be restored exactly as you left it.']" />
                        <g:render template="example" model="[id: 'columnCalculations', title: 'Summary Calculations', desc: 'A summary row can be placed at the top or bottom of the table, displaying aggregated values such as sums, averages, counts, or custom calculations for each column.']" />
                        <g:render template="example" model="[id: 'noColumnHeaders', title: 'Hidden Headers', desc: 'Hiding the header row turns the table into a minimal list view — useful for simple key-value displays or compact data listings.']" />
                        <g:render template="example" model="[id: 'rtlTextDirection', title: 'RTL Text Direction', desc: 'Full support for right-to-left text direction, ensuring correct layout for languages such as Arabic and Hebrew.']" />

                        <h5 class="category-header">Data</h5>

                        <g:render template="example" model="[id: 'editableData', title: 'Inline Editing', desc: 'Individual columns can be marked as editable, turning cells into inline input fields. Every edit fires a callback, and the full dataset (including changes) can be retrieved at any time via the API.']" />
                        <g:render template="example" model="[id: 'validateUserInput', title: 'Input Validation', desc: 'Validation rules can be attached to editable columns so that user-entered values are checked before being accepted — for example, requiring a non-empty string, a number within a range, or a value matching a pattern.']" />
                        <g:render template="example" model="[id: 'filterDataInHeader', title: 'Header Filters', desc: 'Each column header can include a built-in filter input, letting users narrow down the displayed rows by typing directly into the header area.']" />
                        <g:render template="example" model="[id: 'sorters', title: 'Column Sorting', desc: 'Clicking a column header sorts the table by that column. The engine automatically detects the appropriate sort method (text, number, date, etc.) based on the data, and custom sorters can be supplied for specialised ordering.']" />
                        <g:render template="example" model="[id: 'groupingData', title: 'Row Grouping', desc: 'Rows can be organised into collapsible groups based on the value of a shared field, making it easy to browse categorised datasets.']" />
                        <g:render template="example" model="[id: 'pagination', title: 'Pagination', desc: 'Large datasets can be split across numbered pages with configurable page size and navigation controls, reducing the amount of data shown at once.']" />

                        <h5 class="category-header">Interaction</h5>

                        <g:render template="example" model="[id: 'selectableRows', title: 'Row Selection', desc: 'Rows can be selected by clicking, by holding Shift and dragging across multiple rows, or programmatically through the API. Selected rows are highlighted and accessible via dedicated methods.']" />
                        <g:render template="example" model="[id: 'selectableRowsWithTickbox', title: 'Checkbox Row Selection', desc: 'A checkbox column in the row header provides a familiar, explicit way to select one or more rows, including a header-level select-all toggle.']" />
                        <g:render template="example" model="[id: 'selectableCellRange', title: 'Cell Range Selection', desc: 'Spreadsheet-style range selection lets users click and drag to highlight a rectangular block of cells rather than whole rows.']" />
                        <g:render template="example" model="[id: 'selectableCellRangeWithClipboard', title: 'Cell Range with Copy & Paste', desc: 'Combining range selection with clipboard support enables users to select, copy, and paste blocks of cells — much like working in a spreadsheet application.']" />
                        <g:render template="example" model="[id: 'movableRows', title: 'Drag-to-Reorder Rows', desc: 'Rows can be reordered by dragging the handle icon on the left edge. A drag handle column is added automatically via the row header configuration.']" />
                        <g:render template="example" model="[id: 'movableRowsWithGroups', title: 'Drag Rows Across Groups', desc: 'When rows are organised into groups, dragging a row across group boundaries moves it into the target group, providing a visual drag-and-drop categorisation workflow.']" />

                    </div>

                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Configuration" id="config-tab"/>
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="config-pane">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-base-content/60 text-sm">Groovy DSL — shared configuration for all examples</span>
                            <button id="copyConfigBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="configCode" class="code-block"><code class="language-groovy">Loading configuration...</code></pre>
                    </div>

                    <input type="radio" name="page-tabs" role="tab" class="tab" aria-label="Usage" id="usage-tab"/>
                    <div role="tabpanel" class="tab-content border border-base-300 rounded-b p-3" id="usage-pane">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-base-content/60 text-sm">HTML Usage</span>
                            <button id="copyUsageBtn" class="btn btn-outline btn-sm" title="Copy to clipboard">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                            </button>
                        </div>
                        <pre id="usageCode" class="code-block"><code class="language-markup">&lt;rb-tabulator
    report-id="your-report-id"
    component-id="yourComponentId"
    api-base-url="&#36;{RbUtils.apiBaseUrl}"
    embed-token="&#36;{RbUtils.embedToken('your-report-id')}"
&gt;&lt;/rb-tabulator&gt;</code></pre>
                    </div>
                </div>

            </div>
        </div>
    </div>

    <!-- Toast -->
    <div id="copyToast" class="toast toast-end toast-bottom hidden" style="position:fixed;z-index:1090;">
        <div class="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4 mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg> Copied to clipboard!
        </div>
    </div>

    <content tag="scripts">
    <script>
        var SVG_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>';
        var SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';

        document.addEventListener('DOMContentLoaded', function() {
            function showToast() {
                var el = document.getElementById('copyToast');
                el.classList.remove('hidden');
                setTimeout(function() { el.classList.add('hidden'); }, 2000);
            }
            var configCodeEl = document.getElementById('configCode');

            function copyWithFeedback(btn, text) {
                navigator.clipboard.writeText(text).then(function() {
                    btn.innerHTML = SVG_CHECK;
                    showToast();
                    setTimeout(function() { btn.innerHTML = SVG_CLIPBOARD; }, 2000);
                });
            }

            // Listen to first rb-tabulator for shared configDsl
            var firstComponent = document.querySelector('rb-tabulator[report-id="tab-examples"]');
            function updateConfigDisplay() {
                if (firstComponent && firstComponent.configDsl) {
                    var escaped = firstComponent.configDsl
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    configCodeEl.innerHTML = '<code class="language-groovy">' + escaped + '</code>';
                    if (window.Prism) Prism.highlightElement(configCodeEl.querySelector('code'));
                }
            }
            if (firstComponent) {
                firstComponent.addEventListener('configLoaded', updateConfigDisplay);
                firstComponent.addEventListener('dataFetched', updateConfigDisplay);
                setTimeout(updateConfigDisplay, 500);
            }

            // Highlight static usage code block
            var usageEl = document.querySelector('#usageCode code');
            if (usageEl && window.Prism) Prism.highlightElement(usageEl);

            // Copy buttons
            document.getElementById('copyConfigBtn').addEventListener('click', function() {
                copyWithFeedback(this, firstComponent ? firstComponent.configDsl || '' : '');
            });
            document.getElementById('copyUsageBtn').addEventListener('click', function() {
                copyWithFeedback(this, document.getElementById('usageCode').innerText);
            });
        });
    </script>
    </content>
</body>
</html>

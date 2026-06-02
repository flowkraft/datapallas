"use client"

import { useState, useEffect, useCallback } from "react"
import { rbConfig } from "@/lib/rb-config"
import { CodeBlock } from "@/components/CodeBlock"

type PageTab = "examples" | "configuration" | "usage"

interface Example {
  id: string
  title: string
  desc: string
  theme?: string
}

interface Category {
  name: string
  examples?: Example[]
  introText?: string
}

const categories: Category[] = [
  {
    name: "Layout",
    examples: [
      { id: "virtualDomVertical", title: "Virtual DOM - Vertical", desc: "The table engine employs a virtual rendering strategy: only the rows currently in the viewport (plus a small buffer) are mounted in the DOM. As you scroll, rows are created and recycled on the fly. This table contains 200 rows but never renders more than a handful at once." },
      { id: "virtualDomHorizontal", title: "Virtual DOM - Horizontal", desc: "When a table has many columns, horizontal virtual rendering can be enabled so that only the visible columns are kept in the DOM. Scroll sideways through this 100-column table to see columns appear and disappear dynamically." },
      { id: "fitToData", title: "Fit To Data", desc: "Each column automatically adjusts its width to match the widest cell content, keeping the table as compact as possible." },
      { id: "fitToDataAndFill", title: "Fit To Data and Fill", desc: "Columns size themselves to their content first, then the remaining horizontal space is distributed so that every row spans the full table width." },
      { id: "fitToDataAndStretchLastColumn", title: "Fit To Data and Stretch Last Column", desc: "Columns size themselves to their content, and the last column stretches to fill whatever space remains, ensuring a clean right edge." },
      { id: "fitTableAndColumnsToData", title: "Fit Table and Columns to Data", desc: "Both the table container and individual columns adapt their dimensions to the data, so the overall table is only as wide and tall as needed." },
      { id: "fitToWidth", title: "Fit To Width", desc: "Columns distribute themselves proportionally across the available container width. Columns without an explicit width grow or shrink according to their widthGrow and widthShrink settings, ensuring the table always fills its parent exactly." },
      { id: "responsiveLayout", title: "Responsive Layout", desc: "When the viewport narrows, lower-priority columns are hidden automatically so the remaining columns never overflow the container. Resize your browser window to watch columns appear and disappear in real time." },
      { id: "responsiveLayoutCollapsedList", title: "Responsive Collapse", desc: "Instead of hiding overflow columns entirely, this mode folds them into an expandable detail list beneath each row. A toggle in the row header lets users show or hide the collapsed content. Try resizing the window to see columns move in and out of the detail list." },
      { id: "automaticColumnGeneration", title: "Auto-Generated Columns", desc: "When no explicit column definitions are provided, the table inspects the first data row and generates columns automatically — useful for quick previews of unknown datasets." },
      { id: "resizableColumns", title: "Column Resizing", desc: "Drag the right edge of any column header to adjust its width. Per-column control over resizability is available, and a fit mode can make a neighbouring column shrink as you enlarge another, keeping the total width constant." },
      { id: "resizeGuides", title: "Resize Guides", desc: "While dragging a column or row edge, a visual guide line follows the cursor so you can see the new size before releasing the mouse." },
      { id: "columnGroups", title: "Grouped Column Headers", desc: "Columns can be nested inside parent groups to create multi-level headers, making it easy to organise related fields under a shared label." },
      { id: "verticalColumnHeaders", title: "Vertical Header Text", desc: "Header text can be rotated vertically, which is handy when you need many narrow columns and horizontal labels would be too wide." },
      { id: "rowHeader", title: "Row Header", desc: "A dedicated header column can be pinned to the left edge of the table, independent of the main data columns — commonly used for row numbers or selection checkboxes." },
      { id: "frozenColumns", title: "Pinned Columns", desc: "Mark specific columns as frozen so they stay fixed in place while the rest of the table scrolls horizontally." },
      { id: "frozenRows", title: "Pinned Rows", desc: "A set number of rows at the top of the table can be pinned so they remain visible as you scroll through the rest of the data." },
      { id: "nestedDataTrees", title: "Tree View", desc: "Hierarchical data can be displayed as an expandable tree. Child rows are indented beneath their parent, and a toggle control lets users collapse or expand each branch." },
      { id: "formatters", title: "Cell Formatters", desc: "Cell values can be rendered visually using built-in formatters such as progress bars, star ratings, tick/cross icons, row numbers, colour swatches, and action buttons — giving the table a richer, more informative appearance." },
      { id: "persistentConfiguration", title: "Saved Layout", desc: "Column widths, ordering, and sort state are saved to local storage automatically. Try resizing or rearranging the columns below, then refresh the page — your layout will be restored exactly as you left it." },
      { id: "columnCalculations", title: "Summary Calculations", desc: "A summary row can be placed at the top or bottom of the table, displaying aggregated values such as sums, averages, counts, or custom calculations for each column." },
      { id: "noColumnHeaders", title: "Hidden Headers", desc: "Hiding the header row turns the table into a minimal list view — useful for simple key-value displays or compact data listings." },
      { id: "rtlTextDirection", title: "RTL Text Direction", desc: "Full support for right-to-left text direction, ensuring correct layout for languages such as Arabic and Hebrew." },
    ],
  },
  {
    name: "Data",
    examples: [
      { id: "editableData", title: "Inline Editing", desc: "Individual columns can be marked as editable, turning cells into inline input fields. Every edit fires a callback, and the full dataset (including changes) can be retrieved at any time via the API." },
      { id: "validateUserInput", title: "Input Validation", desc: "Validation rules can be attached to editable columns so that user-entered values are checked before being accepted — for example, requiring a non-empty string, a number within a range, or a value matching a pattern." },
      { id: "filterDataInHeader", title: "Header Filters", desc: "Each column header can include a built-in filter input, letting users narrow down the displayed rows by typing directly into the header area." },
      { id: "sorters", title: "Column Sorting", desc: "Clicking a column header sorts the table by that column. The engine automatically detects the appropriate sort method (text, number, date, etc.) based on the data, and custom sorters can be supplied for specialised ordering." },
      { id: "groupingData", title: "Row Grouping", desc: "Rows can be organised into collapsible groups based on the value of a shared field, making it easy to browse categorised datasets." },
      { id: "pagination", title: "Pagination", desc: "Large datasets can be split across numbered pages with configurable page size and navigation controls, reducing the amount of data shown at once." },
    ],
  },
  {
    name: "Interaction",
    examples: [
      { id: "selectableRows", title: "Row Selection", desc: "Rows can be selected by clicking, by holding Shift and dragging across multiple rows, or programmatically through the API. Selected rows are highlighted and accessible via dedicated methods." },
      { id: "selectableRowsWithTickbox", title: "Checkbox Row Selection", desc: "A checkbox column in the row header provides a familiar, explicit way to select one or more rows, including a header-level select-all toggle." },
      { id: "selectableCellRange", title: "Cell Range Selection", desc: "Spreadsheet-style range selection lets users click and drag to highlight a rectangular block of cells rather than whole rows." },
      { id: "selectableCellRangeWithClipboard", title: "Cell Range with Copy & Paste", desc: "Combining range selection with clipboard support enables users to select, copy, and paste blocks of cells — much like working in a spreadsheet application." },
      { id: "movableRows", title: "Drag-to-Reorder Rows", desc: "Rows can be reordered by dragging the handle icon on the left edge. A drag handle column is added automatically via the row header configuration." },
      { id: "movableRowsWithGroups", title: "Drag Rows Across Groups", desc: "When rows are organised into groups, dragging a row across group boundaries moves it into the target group, providing a visual drag-and-drop categorisation workflow." },
    ],
  },
]

const usageCode = `<rb-tabulator
  report-id="your-report-id"
  component-id="yourComponentId"
  api-base-url="\${apiBaseUrl}"
  api-key="\${apiKey}"
></rb-tabulator>`

export default function TabulatorPage() {
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<PageTab>("examples")
  const [configDsl, setConfigDsl] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (customElements.get("rb-tabulator")) {
      setIsReady(true)
      return
    }
    const handleLoaded = () => setIsReady(true)
    window.addEventListener("rb-components-loaded", handleLoaded)
    return () => window.removeEventListener("rb-components-loaded", handleLoaded)
  }, [])

  // Listen to first rb-tabulator for shared configDsl
  useEffect(() => {
    if (!isReady) return
    const el = document.querySelector('rb-tabulator[report-id="tab-examples"]') as any
    if (!el) return
    const handler = () => { if (el.configDsl) setConfigDsl(el.configDsl) }
    el.addEventListener("configLoaded", handler)
    el.addEventListener("dataFetched", handler)
    setTimeout(handler, 500)
    return () => {
      el.removeEventListener("configLoaded", handler)
      el.removeEventListener("dataFetched", handler)
    }
  }, [isReady])

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }, [])

  const tabClass = (tab: PageTab) =>
    `pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
    }`

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h4 className="text-2xl font-bold text-base-content mb-2">Data Tables</h4>
        <p className="text-base-content/60 mb-6">
          Interactive data tables powered by <code className="text-sm bg-base-200 text-base-content px-1 rounded">&lt;rb-tabulator&gt;</code>.
        </p>

        {/* Page-level tabs */}
        <div className="border-b border-base-300 mb-0">
          <div className="flex space-x-6" role="tablist">
            <button id="examples-tab" role="tab" onClick={() => setActiveTab("examples")} className={tabClass("examples")}>Examples</button>
            <button id="config-tab" role="tab" onClick={() => setActiveTab("configuration")} className={tabClass("configuration")}>Configuration</button>
            <button id="usage-tab" role="tab" onClick={() => setActiveTab("usage")} className={tabClass("usage")}>Usage</button>
          </div>
        </div>

        <div className="bg-base-100 border border-t-0 border-base-300 rounded-b-lg p-4">
          {/* Examples Tab */}
          {activeTab === "examples" && (
            isReady ? (
              categories.map((category) => (
                <div key={category.name}>
                  <h5 className="text-lg font-bold mt-8 mb-4 pb-2 border-b-2 border-rb-cyan">
                    {category.name}
                  </h5>
                  {category.introText && (
                    <p className="text-sm text-base-content/60 mb-4">{category.introText}</p>
                  )}
                  {category.examples?.map((example) => (
                    <div key={example.id} id={`example-${example.id}`} className="border border-base-300 rounded-lg mb-4 overflow-hidden p-4">
                      <h6 className="font-semibold text-sm mb-1">{example.title}</h6>
                      <p className="text-xs text-base-content/60 mb-3">{example.desc}</p>
                      {/* @ts-expect-error - Web component custom element */}
                      <rb-tabulator
                        id={`rb-${example.id}`}
                        report-id="tab-examples"
                        component-id={example.id}
                        api-base-url={rbConfig.apiBaseUrl}
                        api-key={rbConfig.apiKey}
                        {...(example.theme ? { theme: example.theme } : {})}
                      />
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-base-content/60">Loading web components...</div>
            )
          )}

          {/* Configuration Tab */}
          {activeTab === "configuration" && (
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-base-content/60">Groovy DSL — shared configuration for all examples</span>
                <button onClick={() => copyToClipboard(configDsl, "config")} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-base-300 rounded hover:bg-base-200">
                  {copied === "config" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                  )}
                </button>
              </div>
              <div id="configCode">
                <CodeBlock code={configDsl || "Loading configuration..."} language="groovy" style={{ maxHeight: "600px" }} />
              </div>
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === "usage" && (
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm text-base-content/60">HTML Usage</span>
                <button onClick={() => copyToClipboard(usageCode, "usage")} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-base-300 rounded hover:bg-base-200">
                  {copied === "usage" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                  )}
                </button>
              </div>
              <div id="usageCode">
                <CodeBlock code={usageCode} language="markup" style={{ maxHeight: "600px" }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

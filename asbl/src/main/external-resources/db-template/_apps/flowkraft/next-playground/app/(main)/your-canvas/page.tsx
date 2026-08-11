"use client"

import Link from "next/link"
import { rbConfig } from "@/lib/rb-config"

export default function YourCanvasPage() {
  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Hero Section */}
        <div className="canvas-hero text-center p-12 mb-8 rounded-xl bg-gradient-to-br from-primary/5 to-info/10">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            <i className="bi bi-palette"></i> Your Canvas Awaits
          </h1>
          <p className="text-xl text-base-content/60 max-w-2xl mx-auto mb-6">
            You have the data. You have the components. Now build something that matters to your users.
          </p>
        </div>

        {/* What You Can Build */}
        <div className="canvas-section mb-12">
          <h4 className="text-2xl font-semibold text-primary mb-4">
            <i className="bi bi-stars me-2"></i>What You Can Build
          </h4>
          <p className="text-base-content/60 mb-6">
            Combine these components to create dashboards, self-service portals, and interactive reports:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-table text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Data Tables</h5>
              <p className="text-base-content/60 text-sm">
                Sortable, filterable, paginated tables. Let users explore data their way.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-bar-chart text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Charts</h5>
              <p className="text-base-content/60 text-sm">
                Bar, line, pie, area charts. Turn numbers into stories.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-grid-3x3 text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Pivot Tables</h5>
              <p className="text-base-content/60 text-sm">
                Drag-and-drop analysis. Users answer their own questions.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-sliders text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Parameters</h5>
              <p className="text-base-content/60 text-sm">
                Date pickers, dropdowns, filters. Dynamic reports that respond to user input.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-file-earmark-text text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Rendered Reports</h5>
              <p className="text-base-content/60 text-sm">
                Invoices, payslips, statements. Pixel-perfect documents from templates.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-database text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Data Warehouse</h5>
              <p className="text-base-content/60 text-sm">
                OLAP engines for big data. DuckDB, ClickHouse — query millions of rows.
              </p>
            </div>

            <div className="showcase-card bg-base-100 border border-base-300 rounded-xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
              <i className="bi bi-columns-gap text-5xl text-rb-cyan mb-4 block"></i>
              <h5 className="text-lg font-semibold text-base-content mb-2">Dashboards</h5>
              <p className="text-base-content/60 text-sm">
                Combine all of the above. One page, complete insight.
              </p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="canvas-section mb-12">
          <h4 className="text-2xl font-semibold text-primary mb-4">
            <i className="bi bi-gear me-2"></i>How It Works
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <ol className="step-list list-none p-0 space-y-5">
                <li className="relative pl-12">
                  <span className="absolute left-0 top-0 w-8 h-8 bg-rb-cyan text-primary-content rounded-full flex items-center justify-center font-semibold text-sm">
                    1
                  </span>
                  <strong className="block text-base-content">Define your reports in DataPallas</strong>
                  <span className="text-base-content/60"> — Connect to any datasource that returns rows</span>
                </li>
                <li className="relative pl-12">
                  <span className="absolute left-0 top-0 w-8 h-8 bg-rb-cyan text-primary-content rounded-full flex items-center justify-center font-semibold text-sm">
                    2
                  </span>
                  <strong className="block text-base-content">Add the component to your dashboard</strong>
                  <span className="text-base-content/60"> — One HTML tag per visualization</span>
                </li>
                <li className="relative pl-12">
                  <span className="absolute left-0 top-0 w-8 h-8 bg-rb-cyan text-primary-content rounded-full flex items-center justify-center font-semibold text-sm">
                    3
                  </span>
                  <strong className="block text-base-content">Deploy</strong>
                  <span className="text-base-content/60"> — Users access it through any web page</span>
                </li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-base-content mb-3">Example: Add a chart to any page</p>
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-gray-300 rounded-lg p-4 font-mono text-sm overflow-x-auto leading-relaxed border border-gray-700">
                <span className="text-blue-400">&lt;rb-chart</span>
                {"\n    "}
                <span className="text-cyan-300">report-id</span>=<span className="text-orange-300">&quot;sales-by-region&quot;</span>
                {"\n    "}
                <span className="text-cyan-300">api-base-url</span>=<span className="text-orange-300">&quot;{rbConfig.apiBaseUrl}&quot;</span>
                {"\n    "}
                <span className="text-cyan-300">embed-token</span>=<span className="text-orange-300">&quot;{"{embedToken}"}&quot;</span>
                {"\n"}
                <span className="text-blue-400">&gt;&lt;/rb-chart&gt;</span>
              </div>
              <p className="text-base-content/60 text-sm mt-3">
                That&apos;s it. The component fetches data, reads your chart config, and renders.
              </p>
            </div>
          </div>
        </div>

        {/* Ideas & Inspiration */}
        <div className="canvas-section mb-12">
          <h4 className="text-2xl font-semibold text-primary mb-4">
            <i className="bi bi-lightbulb me-2"></i>Ideas to Get You Started
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            <div className="card bg-base-100 border border-base-300 rounded-lg overflow-hidden h-full">
              <div className="card-body p-6">
                <h6 className="card-title text-base font-semibold mb-4">
                  <i className="bi bi-people text-primary me-2"></i>HR Portal
                </h6>
                <p className="card-text text-sm text-base-content/60">
                  Employee payslips, leave balances, org charts. Each employee sees only their own data.
                </p>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300 rounded-lg overflow-hidden h-full">
              <div className="card-body p-6">
                <h6 className="card-title text-base font-semibold mb-4">
                  <i className="bi bi-graph-up text-success me-2"></i>Sales Dashboard
                </h6>
                <p className="card-text text-sm text-base-content/60">
                  Revenue by region, top products, quarterly trends. Pivot table for ad-hoc analysis.
                </p>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300 rounded-lg overflow-hidden h-full">
              <div className="card-body p-6">
                <h6 className="card-title text-base font-semibold mb-4">
                  <i className="bi bi-receipt text-warning me-2"></i>Customer Portal
                </h6>
                <p className="card-text text-sm text-base-content/60">
                  Invoices, statements, order history. Customers self-serve instead of calling support.
                </p>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300 rounded-lg overflow-hidden h-full">
              <div className="card-body p-6">
                <h6 className="card-title text-base font-semibold mb-4">
                  <i className="bi bi-book text-info me-2"></i>Student Portal
                </h6>
                <p className="card-text text-sm text-base-content/60">
                  Grades, class schedules, assignments, tuition payments. Students and parents access everything in one place.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Call to Action */}
        <div className="cta-section bg-gradient-to-r from-rb-cyan to-primary text-primary-content p-10 rounded-xl text-center">
          <h3 className="text-3xl font-bold mb-4">Start Building</h3>
          <p className="text-lg opacity-95 max-w-2xl mx-auto mb-6">
            Pick a component. Connect your data. Ship something users will love.
          </p>
          <Link
            href="/tabulator"
            className="inline-block bg-base-100 text-primary font-semibold px-8 py-3 rounded-lg transition-transform hover:scale-105 no-underline"
          >
            <i className="bi bi-play-fill me-2"></i>Explore Components
          </Link>
        </div>

      </div>
    </div>
  )
}

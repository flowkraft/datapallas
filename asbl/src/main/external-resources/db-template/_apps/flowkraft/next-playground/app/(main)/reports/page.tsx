"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { rbConfig } from "@/lib/rb-config"
import { CodeBlock } from "@/components/CodeBlock"

interface RbReportElement extends HTMLElement {
  entityCode?: string
  setAttribute(name: string, value: string): void
}

type TabType = "component" | "usage"

interface Employee {
  code: string
  name: string
  department: string
}

const employees: Employee[] = [
  { code: "EMP001", name: "Alice Johnson", department: "Engineering" },
  { code: "EMP002", name: "Bob Smith", department: "Sales" },
  { code: "EMP003", name: "Carol Williams", department: "Marketing" },
]

export default function ReportsPage() {
  const reportRef = useRef<RbReportElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("component")
  const [copiedUsage, setCopiedUsage] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    // Check if components are already loaded
    if (customElements.get("rb-report")) {
      setIsReady(true)
      return
    }

    // Listen for the global loader event
    const handleComponentsLoaded = () => {
      setIsReady(true)
    }

    window.addEventListener("rb-components-loaded", handleComponentsLoaded)
    return () => {
      window.removeEventListener("rb-components-loaded", handleComponentsLoaded)
    }
  }, [])

  // Auto-select a random employee on load (mirrors Grails)
  useEffect(() => {
    const codes = employees.map(e => e.code)
    const randomCode = codes[Math.floor(Math.random() * codes.length)]
    setSelectedEmployee(randomCode)
    setShowPlaceholder(false)
    if (reportRef.current) {
      reportRef.current.setAttribute("entity-code", randomCode)
      reportRef.current.entityCode = randomCode
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectEmployee = (code: string) => {
    console.log("Selecting employee:", code)
    setSelectedEmployee(code)
    setShowPlaceholder(false)

    if (reportRef.current) {
      const element = reportRef.current

      // Set entity-code attribute
      element.setAttribute("entity-code", code)

      // Force re-fetch by toggling entityCode property
      element.entityCode = ""
      setTimeout(() => {
        element.entityCode = code
        console.log("Set entityCode to:", code)
      }, 10)
    }
  }

  const handleRefresh = () => {
    if (selectedEmployee && reportRef.current) {
      const element = reportRef.current
      element.entityCode = ""
      setTimeout(() => {
        if (selectedEmployee) {
          element.entityCode = selectedEmployee
        }
      }, 10)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUsage(true)
      setTimeout(() => setCopiedUsage(false), 2000)

      toast({
        title: "Copied to clipboard",
        duration: 2000,
      })
    } catch (err) {
      toast({
        title: "Copy failed",
        variant: "destructive",
        duration: 2000,
      })
    }
  }

  const usageCode = `<rb-report
  report-id="rep-employee-payslip"
  entity-code="EMP001"
  api-base-url="${rbConfig.apiBaseUrl}"
  api-key="${rbConfig.apiKey}"
></rb-report>

<!-- The entity-code attribute specifies which
     employee's payslip to render. The component
     fetches data and renders the HTML template
     server-side for that specific entity. -->`

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-base-content mb-3">
            Reports
          </h1>
          <p className="text-lg text-base-content/60 mb-4">
            Embed full reports using the <code className="bg-base-200 px-2 py-1 rounded text-sm">&lt;rb-report&gt;</code> component in{" "}
            <code className="bg-base-200 px-2 py-1 rounded text-sm">entity-code</code> mode.
            Click a person's name to view their document.
          </p>
        </div>

        <div className="mb-6">
          <div className="border-b border-base-300">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab("component")}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "component"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                </svg>
                Report
              </button>
              <button
                id="usage-tab"
                onClick={() => setActiveTab("usage")}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "usage"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>
                </svg>
                Usage
              </button>
            </div>
          </div>
        </div>

        <div className="bg-base-100 border border-base-300 rounded-lg shadow-sm">
          {activeTab === "component" && (
            <div className="p-6">
              {/* Employee Selection */}
              <div className="mb-4">
                <label className="block font-semibold mb-3">Select Employee:</label>
                <div className="flex gap-4 flex-wrap">
                  {employees.map((emp) => (
                    <div
                      key={emp.code}
                      data-code={emp.code}
                      onClick={() => selectEmployee(emp.code)}
                      className={`
                        employee-card px-6 py-4 border-2 rounded-lg cursor-pointer transition-all min-w-[180px]
                        ${
                          selectedEmployee === emp.code
                            ? "active border-primary bg-primary/5 shadow-[0_0_0_3px_rgba(59,130,246,0.2)]"
                            : "border-base-300 bg-base-100 hover:border-primary/60 hover:bg-primary/5"
                        }
                      `}
                    >
                      <div className="font-semibold text-base-content">
                        {emp.name}
                      </div>
                      <div className="text-sm text-base-content/60">
                        {emp.code} • {emp.department}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payslip Display */}
              <div className="border border-base-300 rounded-lg">
                <div className="border-b border-base-300 p-4 flex justify-between items-center">
                  <span className="font-semibold">Employee Payslip</span>
                  <Button
                    onClick={handleRefresh}
                    variant="outline"
                    size="sm"
                    disabled={!selectedEmployee}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
                    </svg>
                  </Button>
                </div>
                <div className="p-6 min-h-[400px] relative">
                  {showPlaceholder && (
                    <div className="text-center text-base-content/60 py-20">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12 mx-auto mb-4 opacity-30">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                      </svg>
                      <p>Select an employee above to view their payslip</p>
                    </div>
                  )}
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-report
                    ref={reportRef}
                    id="demoReport"
                    report-id="rep-employee-payslip"
                    api-base-url={rbConfig.apiBaseUrl}
                    api-key={rbConfig.apiKey}
                    show-print-button
                    print-button-label="Print / Save PDF"
                    style={{ display: showPlaceholder ? "none" : "block" }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "usage" && (
            <div className="relative">
              <div className="absolute top-4 right-4 z-10">
                <Button
                  onClick={() => copyToClipboard(usageCode)}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-base-100/80 backdrop-blur"
                >
                  {copiedUsage ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                    </svg>
                  )}
                  {copiedUsage ? "Copied!" : "Copy"}
                </Button>
              </div>
              <div id="usageCode">
                <CodeBlock code={usageCode} language="markup" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

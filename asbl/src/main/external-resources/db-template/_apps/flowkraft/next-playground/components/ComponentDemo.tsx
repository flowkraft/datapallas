"use client"

import { ReactNode, useState } from "react"
import { CodeBlock } from "@/components/CodeBlock"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface ComponentDemoProps {
  title: string
  description: string
  component: ReactNode
  configuration: string
  usageCode: string
  onRefresh?: () => void
}

type TabType = "component" | "configuration" | "usage"

export function ComponentDemo({
  title,
  description,
  component,
  configuration,
  usageCode,
  onRefresh,
}: ComponentDemoProps) {
  const [activeTab, setActiveTab] = useState<TabType>("component")
  const [copiedConfig, setCopiedConfig] = useState(false)
  const [copiedUsage, setCopiedUsage] = useState(false)
  const { toast } = useToast()

  const copyToClipboard = async (text: string, type: "config" | "usage") => {
    try {
      await navigator.clipboard.writeText(text)

      if (type === "config") {
        setCopiedConfig(true)
        setTimeout(() => setCopiedConfig(false), 2000)
      } else {
        setCopiedUsage(true)
        setTimeout(() => setCopiedUsage(false), 2000)
      }

      toast({
        title: "Copied to clipboard",
        description: `${type === "config" ? "Configuration" : "Usage code"} copied successfully`,
        duration: 2000,
      })
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
        duration: 2000,
      })
    }
  }

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-base-content mb-3">
            {title}
          </h1>
          <p className="text-lg text-base-content/60 max-w-3xl mx-auto">
            {description}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-base-300">
            <div className="flex space-x-8">
              <button
                id="component-tab"
                onClick={() => setActiveTab("component")}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === "component"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                Component
              </button>
              <button
                id="config-tab"
                onClick={() => setActiveTab("configuration")}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === "configuration"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                Configuration
              </button>
              <button
                id="usage-tab"
                onClick={() => setActiveTab("usage")}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === "usage"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                Usage
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-base-100 border border-base-300 rounded-lg shadow-sm">
          {activeTab === "component" && (
            <div className="p-6">
              <div className="flex justify-end mb-4">
                {onRefresh && (
                  <Button
                    id="refreshBtn"
                    onClick={onRefresh}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
                    </svg>
                    Refresh
                  </Button>
                )}
              </div>
              <div className="w-full">{component}</div>
            </div>
          )}

          {activeTab === "configuration" && (
            <div className="relative">
              <div className="absolute top-4 right-4 z-10">
                <Button
                  onClick={() => copyToClipboard(configuration, "config")}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-base-100/80 backdrop-blur"
                >
                  {copiedConfig ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                    </svg>
                  )}
                  {copiedConfig ? "Copied!" : "Copy"}
                </Button>
              </div>
              <div id="configCode">
                <CodeBlock
                  code={configuration}
                  language="groovy"
                />
              </div>
            </div>
          )}

          {activeTab === "usage" && (
            <div className="relative">
              <div className="absolute top-4 right-4 z-10">
                <Button
                  onClick={() => copyToClipboard(usageCode, "usage")}
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
                <CodeBlock
                  code={usageCode}
                  language="markup"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

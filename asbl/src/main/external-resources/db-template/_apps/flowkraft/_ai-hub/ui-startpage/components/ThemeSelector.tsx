"use client"

import { useState } from "react"
import { themes } from "@/lib/themes"
import { useThemeSettings } from "@/hooks/useThemeSettings"

export function ThemeSelector() {
  const { colorTheme, setColorTheme, isLoading } = useThemeSettings()
  const [isOpen, setIsOpen] = useState(false)

  const handleThemeChange = async (themeName: string) => {
    await setColorTheme(themeName)
    setIsOpen(false)
  }

  const currentThemeLabel = themes.find((t) => t.name === colorTheme)?.label || "DataPallas"

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-base-content/60">
        {/* Heroicon: swatch (palette) */}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 animate-pulse">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
        </svg>
        <span className="hidden md:inline">Loading...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-base-content/60 hover:text-base-content rounded-md transition-colors"
        aria-label="Select theme"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
        </svg>
        <span className="hidden md:inline">{currentThemeLabel}</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-base-100 border border-base-300 rounded-box shadow-lg z-50">
            <div className="py-1">
              <div className="px-3 py-2 text-xs font-semibold text-base-content/60 border-b border-base-300">
                Color Theme
              </div>
              {themes.map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => handleThemeChange(theme.name)}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-base-200 transition-colors flex items-center justify-between"
                >
                  <span className="text-base-content">{theme.label}</span>
                  {colorTheme === theme.name && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-primary">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

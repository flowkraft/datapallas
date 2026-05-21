// Removed — daisyUI v5 handles theming via data-theme on <html> + no-flash script in layout.tsx
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

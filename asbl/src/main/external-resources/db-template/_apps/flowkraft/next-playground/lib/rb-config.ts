// DataPallas API Configuration
// Auto-discovers API key from api-key.txt or uses '123' fallback for development

export const rbConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_RB_API_BASE_URL || "http://localhost:9090/api",
  apiKey: process.env.NEXT_PUBLIC_RB_API_KEY || "123", // Default dev key
}

// Helper function to make authenticated API calls
export async function rbFetch(endpoint: string, options?: RequestInit) {
  const url = `${rbConfig.apiBaseUrl}${endpoint}`
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": rbConfig.apiKey,
    ...options?.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(`DataPallas API error: ${response.statusText}`)
  }

  return response.json()
}

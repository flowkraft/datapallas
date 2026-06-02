"use client"

import { Elements } from "@stripe/react-stripe-js"
import { loadStripe, Stripe } from "@stripe/stripe-js"
import { ReactNode, useEffect, useState } from "react"

// Initialize Stripe with publishable key
let stripePromise: Promise<Stripe | null> | null = null

const getStripe = () => {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) {
      console.warn("Stripe publishable key not configured")
      return null
    }
    stripePromise = loadStripe(key)
  }
  return stripePromise
}

interface StripeProviderProps {
  children: ReactNode
  clientSecret?: string
}

// Stripe card fields render inside cross-origin iframes that cannot read our
// CSS custom properties, so we resolve the active daisyUI theme at runtime and
// pass concrete color values into Stripe's appearance API.
function resolveStripeAppearance() {
  const fallback = {
    text: "#1f2937",
    primary: "#0070f3",
    background: "#ffffff",
    border: "#d1d5db",
    placeholder: "#6b7280",
  }

  if (typeof window === "undefined") return fallback

  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb

  const text = read("--color-base-content", fallback.text)
  const background = read("--color-base-100", fallback.background)
  const border = read("--color-base-300", fallback.border)
  const primary = read("--color-primary", fallback.primary)
  // 60% of base-content over the surface for muted placeholder text
  const placeholder = text
    ? `color-mix(in oklab, ${text} 60%, transparent)`
    : fallback.placeholder

  return { text, primary, background, border, placeholder }
}

export function StripeProvider({ children, clientSecret }: StripeProviderProps) {
  const [stripe, setStripe] = useState<Promise<Stripe | null> | null>(null)

  useEffect(() => {
    setStripe(getStripe())
  }, [])

  if (!stripe) {
    return <>{children}</>
  }

  const theme = resolveStripeAppearance()

  const options = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "stripe" as const,
          variables: {
            colorPrimary: theme.primary,
            colorText: theme.text,
            colorBackground: theme.background,
            colorTextPlaceholder: theme.placeholder,
          },
          rules: {
            ".Input": {
              borderColor: theme.border,
            },
          },
        },
      }
    : undefined

  return (
    <Elements stripe={stripe} options={options}>
      {children}
    </Elements>
  )
}

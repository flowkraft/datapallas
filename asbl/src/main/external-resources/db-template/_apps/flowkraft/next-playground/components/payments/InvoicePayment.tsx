"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { StripeProvider } from "./StripeProvider"
import { StripeCheckoutForm } from "./StripeCheckoutForm"
import { PayPalProvider } from "./PayPalProvider"
import { PayPalCheckout } from "./PayPalCheckout"
import { cn } from "@/lib/utils"
import { getSetting, SETTING_KEYS } from "@/lib/settings"

interface InvoicePaymentProps {
  invoiceId: number
  amount: number
  currency: string
  onPaymentSuccess?: () => void
  defaultProcessor?: "stripe" | "paypal"
}

type PaymentMethod = "stripe" | "paypal"

export function InvoicePayment({
  invoiceId,
  amount,
  currency,
  onPaymentSuccess,
  defaultProcessor,
}: InvoicePaymentProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultProcessor || "stripe")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentComplete, setPaymentComplete] = useState(false)

  // Load default processor from settings on mount
  useEffect(() => {
    if (!defaultProcessor) {
      getSetting(SETTING_KEYS.PAYMENT_PROCESSOR).then((processor) => {
        if (processor === "stripe" || processor === "paypal") {
          setPaymentMethod(processor)
        }
      })
    }
  }, [defaultProcessor])

  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open)
    setError(null)
    setPaymentComplete(false)

    if (open && paymentMethod === "stripe" && !clientSecret) {
      await initializeStripePayment()
    }
  }

  const initializeStripePayment = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          amount,
          currency,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to initialize payment")
      }

      setClientSecret(data.clientSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initialize payment"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaymentMethodChange = async (method: PaymentMethod) => {
    setPaymentMethod(method)
    setError(null)

    if (method === "stripe" && !clientSecret) {
      await initializeStripePayment()
    }
  }

  const handleSuccess = () => {
    setPaymentComplete(true)
    onPaymentSuccess?.()
    // Auto-close after success message
    setTimeout(() => {
      setIsOpen(false)
    }, 2000)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount / 100)

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
          </svg>
          Pay Now
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription>
            Pay {formattedAmount} for Invoice #{invoiceId}
          </DialogDescription>
        </DialogHeader>

        {paymentComplete ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-6 w-6 text-success">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-success">Payment Successful!</h3>
            <p className="text-sm text-base-content/60 mt-1">
              Your payment has been processed.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Payment Method Toggle */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handlePaymentMethodChange("stripe")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md border transition-all",
                  paymentMethod === "stripe"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-base-300 hover:border-primary/50"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
                </svg>
                <span className="font-medium">Card</span>
              </button>
              <button
                onClick={() => handlePaymentMethodChange("paypal")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md border transition-all",
                  paymentMethod === "paypal"
                    ? "border-[#0070ba] bg-[#0070ba]/5 text-[#0070ba]"
                    : "border-base-300 hover:border-[#0070ba]/50"
                )}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 2.79a.77.77 0 0 1 .757-.645h6.527c2.467 0 4.158.614 5.03 1.822.784 1.089.951 2.478.496 4.129-.04.145-.082.297-.129.447a8.243 8.243 0 0 1-.262.786c-.747 1.918-2.2 3.166-4.286 3.695-.534.135-1.112.201-1.723.201H9.137a.77.77 0 0 0-.758.645l-.734 4.526-.26 1.596a.642.642 0 0 1-.633.54h-.676v-.195zm12.237-14.62c-.06.26-.132.523-.218.79-.66 2.048-2.093 3.478-4.26 4.25-.586.208-1.222.34-1.898.4-.213.018-.43.027-.65.027H9.37l-.982 6.227h3.02c.358 0 .663-.26.72-.613l.03-.154.568-3.6.037-.2a.728.728 0 0 1 .72-.613h.453c2.933 0 5.228-1.19 5.9-4.635.282-1.438.136-2.64-.602-3.483-.224-.257-.5-.475-.824-.66.019.094.036.19.05.287.022.156.04.318.053.485l.002.032z" />
                </svg>
                <span className="font-medium">PayPal</span>
              </button>
            </div>

            {error && (
              <div className="p-3 text-sm text-error bg-error/10 rounded-md border border-error/30">
                {error}
              </div>
            )}

            {/* Stripe Payment Form */}
            {paymentMethod === "stripe" && (
              <div className="min-h-[200px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <span className="loading loading-spinner loading-md text-base-content/40"></span>
                    <span className="ml-2 text-base-content/60">
                      Initializing payment...
                    </span>
                  </div>
                ) : clientSecret ? (
                  <StripeProvider clientSecret={clientSecret}>
                    <StripeCheckoutForm
                      invoiceId={invoiceId}
                      amount={amount}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />
                  </StripeProvider>
                ) : error ? null : (
                  <div className="flex items-center justify-center py-12">
                    <span className="loading loading-spinner loading-md text-base-content/40"></span>
                  </div>
                )}
              </div>
            )}

            {/* PayPal Payment */}
            {paymentMethod === "paypal" && (
              <div className="min-h-[200px]">
                <PayPalProvider>
                  <PayPalCheckout
                    invoiceId={invoiceId}
                    amount={amount}
                    currency={currency}
                    onSuccess={handleSuccess}
                    onError={handleError}
                  />
                </PayPalProvider>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

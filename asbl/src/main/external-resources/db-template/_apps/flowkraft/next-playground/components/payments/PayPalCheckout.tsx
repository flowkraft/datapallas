"use client"

import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"

interface PayPalCheckoutProps {
  invoiceId: number
  amount: number
  currency: string
  onSuccess: () => void
  onError: (error: string) => void
}

export function PayPalCheckout({
  invoiceId,
  amount,
  currency,
  onSuccess,
  onError,
}: PayPalCheckoutProps) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer()

  const createOrder = async () => {
    try {
      const response = await fetch("/api/payments/paypal/create-order", {
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
        throw new Error(data.error || "Failed to create PayPal order")
      }

      return data.orderId
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create order"
      onError(message)
      throw err
    }
  }

  const onApprove = async (data: { orderID: string }) => {
    try {
      const response = await fetch("/api/payments/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: data.orderID,
          invoiceId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to capture payment")
      }

      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment capture failed"
      onError(message)
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="loading loading-spinner loading-md text-base-content/40"></span>
        <span className="ml-2 text-base-content/60">Loading PayPal...</span>
      </div>
    )
  }

  if (isRejected) {
    return (
      <div className="p-4 text-sm text-error bg-error/10 rounded-md border border-error/30">
        Failed to load PayPal. Please try again later.
      </div>
    )
  }

  return (
    <div className="paypal-buttons-container">
      <PayPalButtons
        style={{
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "pay",
        }}
        createOrder={createOrder}
        onApprove={onApprove}
        onError={(err) => {
          console.error("PayPal error:", err)
          onError("PayPal payment failed. Please try again.")
        }}
        onCancel={() => {
          // User cancelled - no error needed
        }}
      />
    </div>
  )
}

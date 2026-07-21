// Payment gateway config — a real gateway is "enabled" only when its keys are set; otherwise the pay
// page falls back to the simulated /api/pay settle. Mirrors the Grails PaymentGatewayService.
export const stripeEnabled = () => {
  const k = process.env.STRIPE_SECRET_KEY;
  return !!k && k !== "sk_test_placeholder";
};
export const stripePublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY || "";

export const payPalClientId = () => process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
export const payPalEnabled = () => !!payPalClientId();

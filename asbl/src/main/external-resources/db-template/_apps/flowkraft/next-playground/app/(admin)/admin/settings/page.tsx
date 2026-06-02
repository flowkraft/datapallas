"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings"
import { useToast } from "@/hooks/use-toast"

export default function SettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [defaultCurrency, setDefaultCurrency] = useState("USD")
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY")
  const [paymentProcessor, setPaymentProcessor] = useState("stripe")

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      try {
        const [name, email, currency, format, processor] = await Promise.all([
          getSetting(SETTING_KEYS.COMPANY_NAME),
          getSetting(SETTING_KEYS.COMPANY_EMAIL),
          getSetting(SETTING_KEYS.DEFAULT_CURRENCY),
          getSetting(SETTING_KEYS.DATE_FORMAT),
          getSetting(SETTING_KEYS.PAYMENT_PROCESSOR),
        ])
        if (name) setCompanyName(name)
        if (email) setCompanyEmail(email)
        if (currency) setDefaultCurrency(currency)
        if (format) setDateFormat(format)
        if (processor) setPaymentProcessor(processor)
      } catch (error) {
        console.error("Error loading settings:", error)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const saveCompanySettings = async () => {
    setSaving("company")
    try {
      await Promise.all([
        setSetting(SETTING_KEYS.COMPANY_NAME, companyName, "company", "Company name"),
        setSetting(SETTING_KEYS.COMPANY_EMAIL, companyEmail, "company", "Contact email"),
      ])
      toast({ title: "Company settings saved" })
    } catch { toast({ title: "Failed to save", variant: "destructive" }) }
    finally { setSaving(null) }
  }

  const savePreferences = async () => {
    setSaving("preferences")
    try {
      await Promise.all([
        setSetting(SETTING_KEYS.DEFAULT_CURRENCY, defaultCurrency, "preferences", "Default currency"),
        setSetting(SETTING_KEYS.DATE_FORMAT, dateFormat, "preferences", "Date format"),
      ])
      toast({ title: "Preferences saved" })
    } catch { toast({ title: "Failed to save", variant: "destructive" }) }
    finally { setSaving(null) }
  }

  const savePaymentSettings = async () => {
    setSaving("payment")
    try {
      await setSetting(SETTING_KEYS.PAYMENT_PROCESSOR, paymentProcessor, "payment", "Default payment processor")
      toast({ title: "Payment settings saved" })
    } catch { toast({ title: "Failed to save", variant: "destructive" }) }
    finally { setSaving(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-md text-base-content/40"></span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 id="settings-page-title" className="text-xl font-semibold text-base-content">Settings</h1>
        <p className="text-base-content/60 text-sm mt-1">Configure your application preferences</p>
      </div>

      <div id="settings-cards-grid" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card id="settings-card-company">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>
              </svg>
              <CardTitle className="text-sm font-medium text-base-content">Company</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="companyName" className="text-xs text-base-content/60">Name</Label>
              <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="FlowKraft Inc." className="h-8 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label htmlFor="companyEmail" className="text-xs text-base-content/60">Email</Label>
              <Input id="companyEmail" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="admin@company.com" className="h-8 text-sm"/>
            </div>
            <Button id="btn-save-company" size="sm" onClick={saveCompanySettings} disabled={saving === "company"} className="w-full">
              {saving === "company" ? <span className="loading loading-spinner loading-xs"></span> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card id="settings-card-preferences">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
              </svg>
              <CardTitle className="text-sm font-medium text-base-content">Preferences</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="defaultCurrency" className="text-xs text-base-content/60">Currency</Label>
              <select id="defaultCurrency" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}
                className="flex h-8 w-full rounded-md border border-base-300 bg-base-100 px-3 py-1 text-sm text-base-content shadow-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dateFormat" className="text-xs text-base-content/60">Date Format</Label>
              <select id="dateFormat" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}
                className="flex h-8 w-full rounded-md border border-base-300 bg-base-100 px-3 py-1 text-sm text-base-content shadow-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <Button id="btn-save-preferences" size="sm" onClick={savePreferences} disabled={saving === "preferences"} className="w-full">
              {saving === "preferences" ? <span className="loading loading-spinner loading-xs"></span> : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card id="settings-card-payment">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
              </svg>
              <CardTitle className="text-sm font-medium text-base-content">Payment</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="paymentProcessor" className="text-xs text-base-content/60">Default Processor</Label>
              <select id="paymentProcessor" value={paymentProcessor} onChange={(e) => setPaymentProcessor(e.target.value)}
                className="flex h-8 w-full rounded-md border border-base-300 bg-base-100 px-3 py-1 text-sm text-base-content shadow-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
            <p className="text-xs text-base-content/50">Configure API keys in environment variables</p>
            <Button id="btn-save-payment" size="sm" onClick={savePaymentSettings} disabled={saving === "payment"} className="w-full">
              {saving === "payment" ? <span className="loading loading-spinner loading-xs"></span> : "Save"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

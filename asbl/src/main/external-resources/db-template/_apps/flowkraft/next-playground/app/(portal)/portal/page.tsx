import Link from "next/link"

export const metadata = { title: "Document Portal — DataPallas" }

export default function PortalHomePage() {
  return (
    <div className="container mx-auto px-4">

      {/* Hero */}
      <section className="text-center py-12 max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Document Portal</h1>
        <p className="text-base-content/60 text-lg leading-relaxed">
          Access your payslips and invoices securely.
        </p>
      </section>

      {/* Document type cards */}
      <section className="max-w-xl mx-auto">
        <p className="text-center text-sm font-medium text-base-content/60 mb-6">Your Documents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Payslips */}
          <Link href="/portal/payslips"
            className="flex flex-col items-center text-center p-6 bg-base-100 border border-base-300 rounded-lg no-underline hover:border-primary hover:shadow-md transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
              className="w-8 h-8 text-primary mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
            </svg>
            <h6 className="font-semibold text-base-content mb-1">Payslips</h6>
            <p className="text-sm text-base-content/60 m-0">View your payslips</p>
          </Link>

          {/* Invoices */}
          <Link href="/portal/invoices"
            className="flex flex-col items-center text-center p-6 bg-base-100 border border-base-300 rounded-lg no-underline hover:border-primary hover:shadow-md transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
              className="w-8 h-8 text-primary mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/>
            </svg>
            <h6 className="font-semibold text-base-content mb-1">Invoices</h6>
            <p className="text-sm text-base-content/60 m-0">View and pay your invoices</p>
          </Link>

        </div>
      </section>

    </div>
  )
}

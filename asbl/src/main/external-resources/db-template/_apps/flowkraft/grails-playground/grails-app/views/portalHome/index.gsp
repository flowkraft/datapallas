<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="portal"/>
    <title>Document Portal - DataPallas</title>
    <style>
        /* Hero section - matches main app style */
        .hero-section {
            text-align: center;
            padding: 3rem 0;
            max-width: 1100px;
            margin: 0 auto;
        }

        .hero-title {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--color-base-content);
            margin-bottom: 1rem;
        }

        .hero-description {
            color: color-mix(in oklch, var(--color-base-content) 60%, transparent);
            font-size: 1.125rem;
            max-width: 800px;
            margin: 0 auto 2rem;
            line-height: 1.7;
        }

        /* Component grid - 2 columns max for portal home */
        .component-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            max-width: 700px;
            margin: 0 auto;
        }

        .component-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 1.5rem;
            background: var(--color-base-100);
            border: 1px solid var(--color-base-300);
            border-radius: 8px;
            text-decoration: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .component-card:hover {
            border-color: var(--color-primary);
            box-shadow: 0 4px 12px color-mix(in oklch, var(--color-primary) 20%, transparent);
        }

        .component-card .icon {
            width: 2rem;
            height: 2rem;
            color: var(--color-primary);
            margin-bottom: 0.75rem;
        }

        .component-card h6 {
            font-weight: 600;
            color: var(--color-base-content);
            margin-bottom: 0.25rem;
        }

        .component-card p {
            font-size: 0.875rem;
            color: color-mix(in oklch, var(--color-base-content) 60%, transparent);
            margin: 0;
        }

        .section-title {
            text-align: center;
            color: color-mix(in oklch, var(--color-base-content) 60%, transparent);
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
        }
    </style>
</head>
<body>

    <!-- Hero Section -->
    <section class="hero-section">
        <h1 class="hero-title">Document Portal</h1>
        <p class="hero-description">
            Access your payslips and invoices securely.
        </p>
    </section>

    <!-- Document type cards -->
    <section class="container">
        <h5 class="section-title">Your Documents</h5>
        <div class="component-grid">

            <!-- Payslips -->
            <a href="${createLink(uri: '/portal/payslips')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                <h6>Payslips</h6>
                <p>View your payslips</p>
            </a>

            <!-- Invoices -->
            <a href="${createLink(uri: '/portal/invoices')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/></svg>
                <h6>Invoices</h6>
                <p>View and pay your invoices</p>
            </a>

        </div>
    </section>

</body>
</html>

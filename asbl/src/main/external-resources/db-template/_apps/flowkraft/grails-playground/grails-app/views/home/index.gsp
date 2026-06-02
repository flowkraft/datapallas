<!DOCTYPE html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>DataPallas - Dashboards & Self Service Portals</title>
    <style>
        /* Hero section - matches Next.js */
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

        .hero-description strong {
            color: var(--color-base-content);
        }

        /* Component grid - matches Next.js exactly */
        .component-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            max-width: 1200px;
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

    <!-- Hero Section - matches Next.js page.tsx exactly -->
    <section class="hero-section">
        <h1 class="hero-title">Dashboards. Self Service Portals.</h1>
        <p class="hero-description">
            Bring your reports to the <strong>frontend</strong>: dashboards, portals, anywhere your users need them.
            Use our 'quick to get things done' (highly capable and fully customizable) portal, or
            <strong>embed DataPallas reports</strong> directly into your existing web applications and portals —
            responsive, secure, and themeable to match your look and feel.
        </p>
    </section>

    <!-- Component Grid - matches Next.js component array exactly -->
    <section class="container">
        <h5 class="section-title">Explore Components</h5>
        <div class="component-grid">

            <!-- Tabulator -->
            <a href="${createLink(uri: '/tabulator')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m7.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5"/></svg>
                <h6>Tabulator</h6>
                <p>Interactive data tables</p>
            </a>

            <!-- Charts -->
            <a href="${createLink(uri: '/charts')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>
                <h6>Charts</h6>
                <p>Data visualization</p>
            </a>

            <!-- Pivot Tables -->
            <a href="${createLink(uri: '/pivot-tables')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h1.5m-1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m7.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5"/></svg>
                <h6>Pivot Tables</h6>
                <p>Data analysis</p>
            </a>

            <!-- Parameters -->
            <a href="${createLink(uri: '/report-parameters')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/></svg>
                <h6>Parameters</h6>
                <p>Report configuration</p>
            </a>

            <!-- Reports -->
            <a href="${createLink(uri: '/reports')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                <h6>Reports</h6>
                <p>Full report examples</p>
            </a>

            <!-- Data Warehouse -->
            <a href="${createLink(uri: '/data-warehouse')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>
                <h6>Data Warehouse</h6>
                <p>Explore & query data</p>
            </a>

            <!-- Dashboards -->
            <a href="${createLink(uri: '/dashboards')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"/></svg>
                <h6>Dashboards</h6>
                <p>Executive dashboards</p>
            </a>

            <!-- Your Canvas -->
            <a href="${createLink(uri: '/your-canvas')}" class="component-card">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"/></svg>
                <h6>Your Canvas</h6>
                <p>Build your own</p>
            </a>

        </div>
    </section>

</body>
</html>

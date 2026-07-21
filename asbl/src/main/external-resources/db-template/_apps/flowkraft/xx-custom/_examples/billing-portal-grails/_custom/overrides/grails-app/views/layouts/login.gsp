<%-- Minimal layout for the public sign-in page — the 1:1 mirror of the Next portal's ROOT layout
     (billing-portal-next/_custom/overrides/app/layout.tsx): theme + Tailwind and the card, with NO
     nav, footer or theme switcher. The authenticated portal pages keep the full 'portal' layout;
     the sign-in page is card-only so the two stacks' /login pages match. Its head is identical to
     portal.gsp's (same favicon, themeInit, tailwind.css) so the card is styled and themed the same
     way — only the chrome is dropped. --%>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title><g:layoutTitle default="Billing Portal"/></title>

    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='m22 2-7 20-4-9-9-4Z' fill='%2322a7c8'/></svg>" type="image/svg+xml"/>

    <!-- No-flash theme -->
    <g:render template="/common/themeInit"/>

    <!-- Tailwind v4 + daisyUI v5 -->
    <asset:stylesheet src="tailwind.css"/>

    <g:layoutHead/>
</head>
<body class="min-h-screen flex flex-col">
  <g:layoutBody/>
</body>
</html>

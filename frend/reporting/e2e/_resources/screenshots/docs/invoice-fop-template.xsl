<?xml version="1.0" encoding="UTF-8"?>
<fo:root xmlns:fo="http://www.w3.org/1999/XSL/Format">

  <fo:layout-master-set>
    <fo:simple-page-master master-name="A4" page-height="29.7cm" page-width="21cm"
                           margin-top="1cm" margin-bottom="1cm" margin-left="1.5cm" margin-right="1.5cm">
      <fo:region-body margin-top="0.5cm" margin-bottom="1.5cm"/>
      <fo:region-after extent="1.2cm"/>
    </fo:simple-page-master>
  </fo:layout-master-set>

  <fo:page-sequence master-reference="A4" font-family="Helvetica, Arial, sans-serif" font-size="9pt" color="#1a1a2e">

    <!-- Footer -->
    <fo:static-content flow-name="xsl-region-after">
      <fo:block text-align="center" font-size="7.5pt" color="#8a8fa3" padding-top="4pt"
                border-top="0.5pt solid #dce0e6">
        Thank you for your business! — Northwind Traders — northwind@example.com
      </fo:block>
    </fo:static-content>

    <fo:flow flow-name="xsl-region-body">

      <!-- ========== HEADER: Logo + Company / Invoice Meta ========== -->
      <fo:table table-layout="fixed" width="100%">
        <fo:table-column column-width="50%"/>
        <fo:table-column column-width="50%"/>
        <fo:table-body>
          <fo:table-row>
            <!-- Left: SVG Logo + Company Details -->
            <fo:table-cell>
              <fo:block space-after="4pt">
                <fo:instream-foreign-object>
                  <svg xmlns="http://www.w3.org/2000/svg" width="160" height="42" viewBox="0 0 160 42">
                    <path d="M4 38 C4 38 12 4 28 4 C36 4 40 14 36 22 C32 30 20 36 4 38Z" fill="#1b3a5c" opacity="0.9"/>
                    <path d="M18 38 C18 38 28 10 40 8 C48 6 50 16 46 24 C42 32 30 36 18 38Z" fill="#2e6b9e" opacity="0.85"/>
                    <path d="M2 38 L50 38" stroke="#1b3a5c" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M2 42 Q14 36 26 42 Q38 48 50 42" stroke="#2e6b9e" stroke-width="1.2" fill="none" opacity="0.5"/>
                    <text x="58" y="20" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#1b3a5c">Northwind</text>
                    <text x="58" y="34" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#4a6fa5" letter-spacing="2.5">TRADERS</text>
                  </svg>
                </fo:instream-foreign-object>
              </fo:block>
              <fo:block font-size="8pt" color="#4a5568" space-before="4pt">123 Harbor Boulevard, Suite 400</fo:block>
              <fo:block font-size="8pt" color="#4a5568">Seattle, WA 98101, USA</fo:block>
              <fo:block font-size="8pt" color="#4a5568">Tel: (206) 555-0120</fo:block>
              <fo:block font-size="8pt" color="#4a5568">northwind@example.com</fo:block>
            </fo:table-cell>
            <!-- Right: Invoice title + meta -->
            <fo:table-cell text-align="end" display-align="before">
              <fo:block font-size="26pt" font-weight="bold" color="#1b3a5c" space-after="6pt">INVOICE</fo:block>
              <fo:block font-size="9pt" color="#4a5568" space-after="2pt">
                Invoice #: <fo:inline font-weight="bold" color="#1a1a2e">${invoice_id!""}</fo:inline>
              </fo:block>
              <fo:block font-size="9pt" color="#4a5568" space-after="2pt">
                Date: <fo:inline font-weight="bold" color="#1a1a2e"><#if invoice_date?is_date>${invoice_date?string("MM/dd/yyyy")}<#else>${(invoice_date!"")?xml}</#if></fo:inline>
              </fo:block>
              <fo:block font-size="9pt" color="#4a5568" space-after="2pt">
                Due: <fo:inline font-weight="bold" color="#1a1a2e"><#if due_date?is_date>${due_date?string("MM/dd/yyyy")}<#else>${(due_date!"")?xml}</#if></fo:inline>
              </fo:block>
              <fo:block font-size="9pt" space-after="2pt">
                Status: <fo:inline font-weight="bold" color="<#if (status!"") == "PAID">#16a34a<#else>#d97706</#if>">${(status!"")?xml}</fo:inline>
              </fo:block>
            </fo:table-cell>
          </fo:table-row>
        </fo:table-body>
      </fo:table>

      <!-- Divider -->
      <fo:block space-before="10pt" space-after="10pt" border-bottom="2pt solid #1b3a5c"/>

      <!-- ========== BILL TO ========== -->
      <fo:block font-size="8pt" font-weight="bold" color="#2e6b9e" space-after="3pt" text-transform="uppercase" letter-spacing="1pt">Bill To</fo:block>
      <fo:block font-size="10pt" font-weight="bold" space-after="2pt">${(company_name!"")?xml}</fo:block>
      <fo:block font-size="8.5pt" color="#4a5568"><#if contact_name?has_content>Attn: ${(contact_name!"")?xml}</#if></fo:block>
      <fo:block font-size="8.5pt" color="#4a5568">${(address!"")?xml}</fo:block>
      <fo:block font-size="8.5pt" color="#4a5568">${(city!"")?xml}<#if country?has_content>, ${(country!"")?xml}</#if></fo:block>
      <fo:block font-size="8.5pt" color="#4a5568" space-after="12pt">${(email!"")?xml}</fo:block>

      <!-- ========== LINE ITEMS TABLE ========== -->
      <fo:table table-layout="fixed" width="100%" border-collapse="collapse" space-after="0pt">
        <fo:table-column column-width="5%"/>
        <fo:table-column column-width="35%"/>
        <fo:table-column column-width="14%"/>
        <fo:table-column column-width="14%"/>
        <fo:table-column column-width="14%"/>
        <fo:table-column column-width="18%"/>

        <!-- Header -->
        <fo:table-header>
          <fo:table-row background-color="#1b3a5c" color="#ffffff" font-weight="bold" font-size="8pt">
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block text-align="center">#</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block>Product</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block text-align="end">Qty</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block text-align="end">Unit Price</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block text-align="end">Discount</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="6pt 4pt" border="0.5pt solid #1b3a5c">
              <fo:block text-align="end">Line Total</fo:block>
            </fo:table-cell>
          </fo:table-row>
        </fo:table-header>

        <!-- Body -->
        <fo:table-body>
          <#list details as item>
          <fo:table-row background-color="<#if item?index % 2 == 1>#f2f4f7<#else>#ffffff</#if>">
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block text-align="center" font-size="8pt">${item?index + 1}</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block font-size="8.5pt">${(item.product_name!"")?xml}</fo:block>
              <fo:block font-size="7pt" color="#8a8fa3">${(item.category!"")?xml}</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt">${item.quantity!0}</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt"><#if item.unit_price?is_number>${item.unit_price?string(",##0.00")}<#else>${(item.unit_price!"")?xml}</#if></fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt"><#if item.discount?is_number><#if (item.discount > 0)>${(item.discount * 100)?string("0")}%<#else>-</#if><#else>${(item.discount!"")?xml}</#if></fo:block>
            </fo:table-cell>
            <fo:table-cell padding="5pt 4pt" border="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt" font-weight="bold">${(item.line_total!"")?xml}</fo:block>
            </fo:table-cell>
          </fo:table-row>
          </#list>
        </fo:table-body>
      </fo:table>

      <!-- ========== TOTALS ========== -->
      <fo:table table-layout="fixed" width="100%" space-before="2pt">
        <fo:table-column column-width="60%"/>
        <fo:table-column column-width="22%"/>
        <fo:table-column column-width="18%"/>
        <fo:table-body>
          <!-- Subtotal -->
          <fo:table-row>
            <fo:table-cell><fo:block/></fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt" color="#4a5568">Subtotal</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt">${(Subtotal!"")?xml}</fo:block>
            </fo:table-cell>
          </fo:table-row>
          <!-- Freight -->
          <fo:table-row>
            <fo:table-cell><fo:block/></fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt" color="#4a5568">Freight</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt"><#if freight?is_number>${freight?string(",##0.00")}<#else>${(freight!"")?xml}</#if></fo:block>
            </fo:table-cell>
          </fo:table-row>
          <!-- Tax -->
          <fo:table-row>
            <fo:table-cell><fo:block/></fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt" color="#4a5568">Tax (8%)</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="4pt 6pt" border-bottom="0.5pt solid #dce0e6">
              <fo:block text-align="end" font-size="8.5pt">${(Tax!"")?xml}</fo:block>
            </fo:table-cell>
          </fo:table-row>
          <!-- Grand Total -->
          <fo:table-row background-color="#1b3a5c">
            <fo:table-cell><fo:block/></fo:table-cell>
            <fo:table-cell padding="7pt 6pt">
              <fo:block text-align="end" font-size="11pt" font-weight="bold" color="#ffffff">TOTAL DUE</fo:block>
            </fo:table-cell>
            <fo:table-cell padding="7pt 6pt">
              <fo:block text-align="end" font-size="11pt" font-weight="bold" color="#ffffff">$${(GrandTotal!"")?xml}</fo:block>
            </fo:table-cell>
          </fo:table-row>
        </fo:table-body>
      </fo:table>

      <!-- ========== NOTES ========== -->
      <#if notes?has_content>
      <fo:block space-before="16pt" space-after="4pt" font-size="8pt" font-weight="bold" color="#2e6b9e"
               text-transform="uppercase" letter-spacing="1pt">Notes</fo:block>
      <fo:block font-size="8.5pt" color="#4a5568" padding="6pt" background-color="#f8f9fb"
                border="0.5pt solid #dce0e6">${(notes!"")?xml}</fo:block>
      </#if>

      <!-- ========== PAYMENT INFO ========== -->
      <fo:block space-before="18pt" space-after="4pt" font-size="8pt" font-weight="bold" color="#2e6b9e"
               text-transform="uppercase" letter-spacing="1pt">Payment Information</fo:block>
      <fo:table table-layout="fixed" width="60%">
        <fo:table-column column-width="35%"/>
        <fo:table-column column-width="65%"/>
        <fo:table-body>
          <fo:table-row>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt" color="#4a5568">Bank:</fo:block></fo:table-cell>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt">Northwind National Bank</fo:block></fo:table-cell>
          </fo:table-row>
          <fo:table-row>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt" color="#4a5568">Account:</fo:block></fo:table-cell>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt">XXXX-XXXX-4820</fo:block></fo:table-cell>
          </fo:table-row>
          <fo:table-row>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt" color="#4a5568">Routing:</fo:block></fo:table-cell>
            <fo:table-cell padding="2pt 0pt"><fo:block font-size="8pt">021-000-089</fo:block></fo:table-cell>
          </fo:table-row>
        </fo:table-body>
      </fo:table>

    </fo:flow>
  </fo:page-sequence>
</fo:root>

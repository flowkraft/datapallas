<%-- Customer form fields. Model: [customer: Customer] — shared by create.gsp and edit.gsp.

     Layout: every field is `flex flex-col` (label above its control) and every control is `w-full`,
     so all inputs share one left edge and one width inside the 2-column grid.
     Do NOT reach for daisyUI's `form-control` / `label-text` here: this app is on daisyUI 5, which
     REMOVED both. With no rule behind it, `form-control` stops being a flex column, each label falls
     back to inline, and the caption sits BESIDE its input — pushing every input to a different x,
     since each caption is a different width. `input-bordered` is gone too (v5 inputs are bordered by
     default). Mirrored in the Next twin's CustomerForm.tsx. --%>
<div class="grid sm:grid-cols-2 gap-4">
  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Name</span>
    <input id="customer-name" name="name" type="text" class="input w-full" required
           value="${customer.name ?: ''}" placeholder="Acme Corp"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Contact name</span>
    <input id="customer-contact-name" name="contactName" type="text" class="input w-full"
           value="${customer.contactName ?: ''}" placeholder="Jane Doe"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Email</span>
    <%-- Settable once, on create. On edit it is readonly AND CustomerController.update() ignores the
         submitted field outright: the email is the REST upsert key and the login username, so a
         rename would make the next Burst miss this customer and create a duplicate under the old
         address. --%>
    <input id="customer-email" name="email" type="email" class="input w-full" required
           value="${customer.email ?: ''}" placeholder="jane@acme.com" ${customer.id ? 'readonly' : ''}/>
    <g:if test="${customer.id}">
      <span class="text-xs text-base-content/50">The email is the customer's login and how their invoices are matched — it cannot be changed.</span>
    </g:if>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Address</span>
    <input id="customer-address" name="address" type="text" class="input w-full"
           value="${customer.address ?: ''}" placeholder="1 Market Street"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">City</span>
    <input id="customer-city" name="city" type="text" class="input w-full"
           value="${customer.city ?: ''}" placeholder="Berlin"/>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Country</span>
    <input id="customer-country" name="country" type="text" class="input w-full"
           value="${customer.country ?: ''}" placeholder="DE"/>
  </label>
</div>
<g:if test="${!customer.id}">
  <p class="text-xs text-base-content/50 mt-2">A new customer also gets a portal login: their email address, with password <strong>changeme</strong>.</p>
</g:if>

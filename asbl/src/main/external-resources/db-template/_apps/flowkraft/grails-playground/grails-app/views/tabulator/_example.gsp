<%@ page import="flowkraft.frend.RbUtils" %>
<div class="example-card" id="example-${id}">
    <h6 class="example-title">${title}</h6>
    <p class="example-desc">${desc}</p>
    <rb-tabulator
        id="rb-${id}"
        report-id="tab-examples"
        component-id="${id}"
        api-base-url="${RbUtils.apiBaseUrl}"
        embed-token="${RbUtils.embedToken('tab-examples')}"
        ${theme ? 'theme="' + theme + '"' : ''}
    ></rb-tabulator>
</div>

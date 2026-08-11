<%@ page import="flowkraft.frend.RbUtils" %>
<div class="example-card" id="example-${id}">
    <h6 class="example-title">${title}</h6>
    <p class="example-desc">${desc}</p>
    <rb-chart
        id="rb-${id}"
        report-id="charts-examples"
        component-id="${id}"
        api-base-url="${RbUtils.apiBaseUrl}"
        embed-token="${RbUtils.embedToken('charts-examples')}"
    ></rb-chart>
</div>

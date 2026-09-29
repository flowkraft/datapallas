/*
 * The Cube Stories page's own parameters - the one place a dashboard declares them (R1).
 *
 * A cube only uses names: the Customer Statement cube writes
 *
 *     condition 'CustomerId', 'equals', customerId
 *
 * and this file says what customerId is. Left at All the whole condition is taken out of the
 * query, which is the credit controller's view of all 80 customers; answered, it is that one
 * customer's statement. A share link or an embed token can lock it (R4), and then the value comes
 * from the signed token and never from the query string - which is what makes the statement safe
 * to send to the customer it is about.
 *
 * Integer, because customer_id is a number in every database the page runs on: the value is bound
 * as a number, not compared as text.
 */
reportParameters {
    parameter(
        id:           'customerId',
        type:         'Integer',
        label:        'Customer',
        defaultValue: ''
    ) {
        constraints(required: false)
        ui(
            control: 'select',
            options: "SELECT '' AS value, '-- All customers --' AS label UNION ALL SELECT CAST(customer_id AS VARCHAR), name FROM cube_demo.erp_customers ORDER BY 2"
        )
    }
}

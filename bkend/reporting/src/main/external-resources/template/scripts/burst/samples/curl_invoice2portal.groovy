/*
 * Groovy Script for DataPallas: Publish Invoice to WordPress Portal
 *
 * This script creates a new 'invoice' post in WordPress via REST API,
 * checking or creating the associated user as needed.
 *
 * Assumptions:
 * - Field values from user variables:
 *   var0=order_id, var1=order_date, var2=customer_id, var3=customer_name, var4=freight, var5=line_items_json,
 *   var6=subtotal, var7=tax, var8=grand_total, var9=associated_user, var10=document_status, var11=was_viewed_by
 * - Authentication via Basic Auth (username:password).
 *
 * Inputs (replace placeholders):
 * - API_ENDPOINT: e.g., 'http://localhost:8080/wp-json/wp/v2/invoice'
 * - AUTH_METHOD: e.g., 'admin:password' for Basic Auth
 */

import groovy.ant.AntBuilder
import com.sourcekraft.documentburster.variables.Variables
// The bundled tools/curl/win/curl.exe is a Windows program (it ships in every package, but runs only there);
// every other OS uses its own curl (without this the script died with: Cannot run program "tools/curl/win/curl.exe").
def curlExecutable = System.getProperty('os.name').toLowerCase().contains('win') ? 'tools/curl/win/curl.exe' : 'curl'


// Inputs
def apiEndpoint = '[PASTE_API_ENDPOINT_HERE]'
def authMethod = '[API_KEY_OR_METHOD]'

// Burst context
def token = ctx.token

// Extract field values from user variables
def orderId        = ctx.variables.getUserVariables(ctx.token).get("var0")
def orderDate      = ctx.variables.getUserVariables(ctx.token).get("var1")
def customerId     = ctx.variables.getUserVariables(ctx.token).get("var2")
def customerName   = ctx.variables.getUserVariables(ctx.token).get("var3")
def freight        = ctx.variables.getUserVariables(ctx.token).get("var4").toFloat()
def lineItemsJson  = ctx.variables.getUserVariables(ctx.token).get("var5") // Should be valid JSON string
def subtotal       = ctx.variables.getUserVariables(ctx.token).get("var6").toFloat()
def tax            = ctx.variables.getUserVariables(ctx.token).get("var7").toFloat()
def grandTotal     = ctx.variables.getUserVariables(ctx.token).get("var8").toFloat()
def associatedUser = ctx.variables.getUserVariables(ctx.token).get("var9")
def documentStatus = ctx.variables.getUserVariables(ctx.token).get("var10")
def wasViewedBy    = ctx.variables.getUserVariables(ctx.token).get("var11")

def ant = new AntBuilder()

// Step 1: Check/Create User
log.info("Step 1: Checking/Creating WordPress User")
def userCheckEndpoint = 'http://localhost:8080/wp-json/wp/v2/users'
def userEmail = associatedUser + '@example.com'
def userExists = false

def checkUserCmd = "-u ${authMethod} -X GET \"${userCheckEndpoint}?search=${associatedUser}\""
log.info("Checking user: curl.exe ${checkUserCmd}")
ant.exec(
    append: true,
    failonerror: false,
    output: "logs/user_check.log",
    executable: curlExecutable
) {
    arg(line: checkUserCmd)
}
def userCheckLog = new File("logs/user_check.log").text
if (userCheckLog.contains('"id"')) {
    userExists = true
    log.info("User exists.")
} else {
    def createUserData = "{\"username\":\"${associatedUser}\", \"email\":\"${userEmail}\", \"password\":\"defaultpass123\", \"roles\":[\"customer\"]}"
    def createUserCmd = "-u ${authMethod} -X POST -H \"Content-Type: application/json\" -d \"${createUserData}\" \"${userCheckEndpoint}\""
    log.info("Creating user: curl.exe ${createUserCmd}")
    ant.exec(
        append: true,
        failonerror: true,
        output: "logs/user_create.log",
        executable: curlExecutable
    ) {
        arg(line: createUserCmd)
    }
    log.info("User created.")
}

// Step 2: Prepare and Publish Invoice Post
log.info("Step 2: Preparing and Publishing Invoice Post")
def postData = [
    title: "Invoice ${orderId}",
    status: 'publish',
    meta: [
        order_id: orderId,
        order_date: orderDate,
        customer_id: customerId,
        customer_name: customerName,
        freight: freight,
        line_items_json: lineItemsJson,
        subtotal: subtotal,
        tax: tax,
        grand_total: grandTotal,
        associated_user: associatedUser,
        document_status: documentStatus,
        was_viewed_by: wasViewedBy
    ]
]
def jsonData = groovy.json.JsonBuilder(postData).toString()

def publishCmd = "-u ${authMethod} -X POST -H \"Content-Type: application/json\" -d \"${jsonData}\" \"${apiEndpoint}\""
log.info("Publishing invoice: curl.exe ${publishCmd}")
ant.exec(
    append: true,
    failonerror: true,
    output: "logs/publish.log",
    executable: curlExecutable
) {
    arg(line: publishCmd)
}
log.info("Invoice published successfully.")

// Log result
def publishLog = new File("logs/publish.log").text
log.info("Publish result: ${publishLog}")
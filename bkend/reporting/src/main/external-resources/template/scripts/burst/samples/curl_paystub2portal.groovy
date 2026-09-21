/*
 * Groovy Script for DataPallas: Publish Paystub to WordPress Portal
 *
 * This script creates a new 'paystub' post in WordPress via REST API,
 * checking or creating the associated user as needed.
 *
 * Assumptions:
 * - Field values from user variables: var0=employee, var1=period, var2=gross_amount, var3=net_amount, var4=associated_user
 * - Authentication via Basic Auth (username:password).
 *
 * Inputs (replace placeholders):
 * - API_ENDPOINT: e.g., 'http://localhost:8080/wp-json/wp/v2/paystub'
 * - AUTH_METHOD: e.g., 'admin:password' for Basic Auth
 *
 * Reference: Adapted from curl_sftp.groovy sample.
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
def employee = ctx.variables.getUserVariables(ctx.token).get("var0")
def period = ctx.variables.getUserVariables(ctx.token).get("var1")
def grossAmount = ctx.variables.getUserVariables(ctx.token).get("var2").toFloat()
def netAmount = ctx.variables.getUserVariables(ctx.token).get("var3").toFloat()
def associatedUser = ctx.variables.getUserVariables(ctx.token).get("var4")

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
    def createUserData = "{\"username\":\"${associatedUser}\", \"email\":\"${userEmail}\", \"password\":\"defaultpass123\", \"roles\":[\"employee\"]}"
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

// Step 2: Prepare and Publish Post
log.info("Step 2: Preparing and Publishing Post")
def postData = [
    title: "${employee} - ${period}",
    status: 'publish',
    meta: [
        employee: employee,
        period: period,
        gross_amount: grossAmount,
        net_amount: netAmount,
        associated_user: associatedUser
    ]
]
def jsonData = groovy.json.JsonBuilder(postData).toString()

def publishCmd = "-u ${authMethod} -X POST -H \"Content-Type: application/json\" -d \"${jsonData}\" \"${apiEndpoint}\""
log.info("Publishing post: curl.exe ${publishCmd}")
ant.exec(
    append: true,
    failonerror: true,
    output: "logs/publish.log",
    executable: curlExecutable
) {
    arg(line: publishCmd)
}
log.info("Post published successfully.")

// Log result
def publishLog = new File("logs/publish.log").text
log.info("Publish result: ${publishLog}")
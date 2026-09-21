/*
 * Groovy Script for DataPallas: Publish Payslip to WordPress Portal
 *
 * This script creates a new 'payslip' post in WordPress via REST API,
 * checking or creating the associated user as needed.
 *
 * Assumptions:
 * - Field values from user variables: var0=employee, var1=employee_id, var2=social_security_number, var3=period, var4=department, var5=job_title, var6=basic_salary, var7=federal_tax, var8=bonuses, var9=social_security_tax, var10=medicare_tax, var11=state_tax, var12=medical, var13=dental, var14=total_earnings, var15=total_deductions, var16=net_pay, var17=associated_user
 * - Authentication via Basic Auth (username:password).
 *
 * Inputs (replace placeholders):
 * - API_ENDPOINT: e.g., 'http://localhost:8080/wp-json/wp/v2/payslip'
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
def employeeId = ctx.variables.getUserVariables(ctx.token).get("var1")
def socialSecurity = ctx.variables.getUserVariables(ctx.token).get("var2")
def period = ctx.variables.getUserVariables(ctx.token).get("var3")
def department = ctx.variables.getUserVariables(ctx.token).get("var4")
def jobTitle = ctx.variables.getUserVariables(ctx.token).get("var5")
def basicSalary = ctx.variables.getUserVariables(ctx.token).get("var6").toFloat()
def federalTax = ctx.variables.getUserVariables(ctx.token).get("var7").toFloat()
def bonuses = ctx.variables.getUserVariables(ctx.token).get("var8").toFloat()
def socialSecurityTax = ctx.variables.getUserVariables(ctx.token).get("var9").toFloat()
def medicareTax = ctx.variables.getUserVariables(ctx.token).get("var10").toFloat()
def stateTax = ctx.variables.getUserVariables(ctx.token).get("var11").toFloat()
def medical = ctx.variables.getUserVariables(ctx.token).get("var12").toFloat()
def dental = ctx.variables.getUserVariables(ctx.token).get("var13").toFloat()
def totalEarnings = ctx.variables.getUserVariables(ctx.token).get("var14").toFloat()
def totalDeductions = ctx.variables.getUserVariables(ctx.token).get("var15").toFloat()
def netPay = ctx.variables.getUserVariables(ctx.token).get("var16").toFloat()
def associatedUser = ctx.variables.getUserVariables(ctx.token).get("var17")

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
        employee_id: employeeId,
        social_security_number: socialSecurity,
        period: period,
        department: department,
        job_title: jobTitle,
        basic_salary: basicSalary,
        federal_tax: federalTax,
        bonuses: bonuses,
        social_security_tax: socialSecurityTax,
        medicare_tax: medicareTax,
        state_tax: stateTax,
        medical: medical,
        dental: dental,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net_pay: netPay,
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
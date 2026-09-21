/*
 *
 * 1. This script should be used as a sample to fetch the 
 *    bursting/distribution meta-data details from an external database.
 *
 * 2. The script can be executed (depending on the need) in either 
 *    startExtractDocument, endExtractDocument or startDistributeDocument 
 *    report bursting life-cycle phases.
 *
 * 3. Please copy and paste (if this is what you need) the content 
 *    of this sample script into the existing 
 *    scripts/burst/startExtractDocument.groovy script.
 *
 * 4. This sample script connects to the DuckDB sample Northwind database
 *    that ships with the product, so it runs as-is with no setup. Change
 *    the connection details to point to your own
 *
 *        Oracle,
 *        Microsoft Access,
 *        Microsoft SQL Server,
 *        Microsoft FoxPro,
 *        IBM DB2,
 *        IBM AS/400,
 *        MySQL,
 *        PostgreSQL,
 *        Teradata,
 *        SQLite,
 *        Apache Derby or
 *        FireBird SQL database
 *
 * 5. The DuckDB and SQLite JDBC drivers already ship in lib/burst, so the
 *    sample below needs nothing extra. For any OTHER database it is
 *    mandatory to copy the correct JDBC driver jar (corresponding to your
 *    database) into the existing lib/burst folder
 *
 * 6. Groovy SQL resources 
 *  
 *        6.1 Groovy SQL - http://groovy.codehaus.org/Tutorial%206%20-%20Groovy%20SQL
 *        6.2 Practically Groovy: JDBC programming with Groovy - 
 *        http://www.ibm.com/developerworks/java/library/j-pg01115/index.html
 *
 */
 
import groovy.sql.Sql

// The DuckDB sample Northwind database bundled with the product, relative to
// the installation folder. Its driver is already in lib/burst.
def northwindUrl = 'jdbc:duckdb:./db/sample-northwind-duckdb/northwind.duckdb'

// Open it READ-ONLY. Two reasons, both of which will bite you otherwise:
//
//   - DuckDB takes an EXCLUSIVE file lock when it opens a database read-write,
//     so a read-write connection here would fail while anything else - the
//     product's own Connections, a DBeaver window - has the same file open.
//     Any number of read-only connections can coexist.
//   - This script only ever SELECTs. Read-only makes that a guarantee the
//     database enforces rather than a promise the script makes.
//
// Note: the access mode MUST be passed as a property. Appending it to the URL
// (...duckdb?access_mode=READ_ONLY) does NOT work - the driver reads the whole
// thing as part of the file name and creates a database with a very odd name.
def props = new Properties()
props.setProperty('duckdb.read_only', 'true')

def sql = Sql.newInstance(northwindUrl, props)


//Oracle sample

//Replace localhost with your host
//Replace username and password with your database login details
//Change to your own database instance

//def sql = Sql.newInstance('jdbc:oracle:thin:@localhost:1521:orcl', 
//                         'username', 'password',
//                         'oracle.jdbc.pool.OracleDataSource' )
					  
//The burst token is used as a key to identify the details
//of the appropriate employee or customer
def token = ctx.token

//Change the SQL to your own need

//Double check your customized SQL is correct and is 
//properly returning the unique details for the appropriate 
//employee/customer (otherwise the risk is to send 
//confidential information to the wrong employee or customer) 

// NOTE ON THE EMAIL ADDRESS. Northwind's Employees table has an Email column,
// but the sample data leaves it empty - so this query DERIVES a demo address
// from the name instead of reading it. That keeps the sample runnable while
// making it obvious the address is fabricated: nothing is ever sent to
// @northwind.example. In your own version, select your real email column here
// and delete the derivation.
def employeeRow = sql.firstRow(
        'SELECT "EmployeeID" AS employee_id, ' +
        'lower("FirstName" || \'.\' || "LastName") || \'@northwind.example\' AS email_address, ' +
        '"FirstName" AS first_name, "LastName" AS last_name ' +
        'FROM "Employees" WHERE CAST("EmployeeID" AS VARCHAR) = ?',
        [token])

if (employeeRow == null)
    throw new IllegalStateException("No employee found for burst token '${token}'. " +
            "Distributing with missing details risks sending to the wrong recipient.")

def emailAddress = employeeRow.email_address

def firstName = employeeRow.first_name
def lastName = employeeRow.last_name

println "Employee: employee_id = $employeeRow.employee_id and " +
         "email_address = ${emailAddress} and first_name = ${firstName} " +
         "and last_name = ${lastName}"

//Populate the fetched information into var0, var1, etc user variables.
ctx.variables.setUserVariable(token,"var0",
                              emailAddress)

ctx.variables.setUserVariable(token,"var1",
                              firstName)

ctx.variables.setUserVariable(token,"var2",
                              lastName)
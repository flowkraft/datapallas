/*
 *
 * 1. This script should be used:
 *
 *      1.1 - As a script to upload reports by SFTP using cURL.
 *      1.2 - As a sample and starting script to invoke cURL during the
 *      report bursting life cycle.
 *
 * 2. curl is a tool to transfer data from or to a server, using one of the
 *    supported protocols (DICT, FILE, FTP, FTPS, GOPHER, HTTP, HTTPS, IMAP,
 *    IMAPS, LDAP, LDAPS, POP3, POP3S, RTMP, RTSP, SCP, SFTP, SMTP, SMTPS,
 *    TELNET and TFTP).
 *    
 *    The command is designed to work without user interaction.
 *
 * 3. curl offers a busload of useful tricks like proxy support,
 *    user authentication, FTP upload, HTTP post, SSL connections, cookies,
 *    file transfer resume and more.
 *
 * 4. The URL syntax is protocol-dependent. You'll find a detailed description
 *    in RFC 3986.
 *
 * 5. The script should be executed during the endExtractDocument
 *    report bursting lifecycle phase.
 *
 * 6. Please copy and paste the content of this sample script
 *    into the existing scripts/burst/endExtractDocument.groovy
 *    script.
 *
 * 7. For a full documentation of the cURL and FTP please see
 *
 *      7.1. http://curl.haxx.se/docs/manual.html
 *      7.2. http://curl.haxx.se/docs/manpage.html
 *
 */
import groovy.ant.AntBuilder

import com.sourcekraft.documentburster.variables.Variables
// The bundled tools/curl/win/curl.exe is a Windows program (it ships in every package, but runs only there);
// every other OS uses its own curl (without this the script died with: Cannot run program "tools/curl/win/curl.exe").
def curlExecutable = System.getProperty('os.name').toLowerCase().contains('win') ? 'tools/curl/win/curl.exe' : 'curl'



/*
 *
 *    The file to be uploaded is the file which has
 *    just been burst.
 *
 */
def uploadFilePath = ctx.extractedFilePath

/*
 *    By default the script is extracting the required SFTP 
 *    session information from the following sources:
 *
 *      userName - from the content of ${var0} user variable
 *      password - from the content of ${var1} user variable
 *
 *      hostName - from the content of ${var2} user variable
 *      absolutePath - from the content of ${var3} user variable
 *
 */
def userName = ctx.variables.getUserVariables(ctx.token).get("var0")
def password = ctx.variables.getUserVariables(ctx.token).get("var1")

def hostName = ctx.variables.getUserVariables(ctx.token).get("var2")
def absolutePath = ctx.variables.getUserVariables(ctx.token).get("var3")

/*
 *
 *    ${execOptions} is the command line to be sent for execution to cURL
 *    - see http://curl.haxx.se/docs/manpage.html
 *
 *    --ftp-create-dirs -
 *
 *      (FTP/SFTP) When an FTP or SFTP URL/operation uses a path that
 *      doesn't currently exist on the server, the standard behavior
 *      of curl is to fail.
 *      Using this option, curl will instead attempt to create 
 *      missing directories.
 *
 *    -T, --upload-file <file>
 *
 *      This transfers the specified local file to the remote URL.
 *      If there is no file part in the specified URL, Curl will
 *      append the local file name.
 *      NOTE that you must use a trailing / on the last directory
 *      to really prove to Curl that there is no file name or curl
 *      will think that your last directory name is	the remote file
 *      name to use. That will most likely cause the upload
 *      operation to fail.
 *      If this is used on a HTTP(S) server, the PUT command
 *      will be used.
 *
 *    -u, --user <user:password>
 *
 *      Specify the user name and password to use for server authentication.
 *
 *    --trace <file>
 *
 *      Enables a full trace dump of all incoming and outgoing data,
 *      including descriptive information, to the given output file.
 *      Use "-" as filename to have the output sent to stdout.
 *      This option overrides previous uses of -v, --verbose or --trace-ascii.
 *      If this option is used several times, the last one will be used.
 *
 *    --trace-ascii <file>
 *
 *      Enables a full trace dump of all incoming and outgoing data,
 *      including descriptive information, to the given output file.
 *      Use "-" as filename to have the output sent to stdout.
 *      This is very similar to --trace, but leaves out the hex part
 *      and only shows the ASCII part of the dump. It makes smaller
 *      output that might be easier to read for untrained humans.
 *      This option overrides previous uses of -v, --verbose or --trace.
 *      If this option is used several times, the last one will be used.
 *
 *    --trace-time
 *
 *      Prepends a time stamp to each trace or verbose line that curl
 *      displays.
 *      Added in curl 7.14.0)
 *
 *    -v, --verbose
 *
 *      Makes the fetching more verbose/talkative.
 *      Mostly useful for debugging. A line starting with '>'
 *      means "header data"	sent by curl, '<' means "header data" 
 *      received by curl that is hidden in normal cases, and a 
 *      line starting with '*' means additional info provided by curl.
 *      Note that if you only want HTTP headers in the output,
 *      -i, --include might be the option you're looking for.
 *      If you think this option still doesn't give you enough details,
 *      consider using --trace or --trace-ascii instead.
 *      This option overrides previous uses of --trace-ascii or --trace.
 *      Use -s, --silent to make curl quiet.
 *
 *    FTPS
 *
 *      It is just like for FTP, but you may also want to specify and use
 *      SSL-specific options for certificates etc.
 *      Note that using FTPS:// as prefix is the "implicit" way as
 *      described in the standards while the recommended "explicit" way is
 *      done by using FTP:// and the --ftp-ssl option.
 *
 *    SFTP / SCP
 *
 *      This is similar to FTP, but you can specify a private key to use
 *      instead of a password.
 *      Note that the private key may itself be protected by a password that is
 *      unrelated to the login password of the remote system.
 *      If you provide a private key file you must also provide
 *      a public key file.
 *
 *    For more details see:
 *
 *      1. http://curl.haxx.se/docs/manual.html
 *      2. http://curl.haxx.se/docs/manpage.html
 *
 */
def execOptions =  "-T \"${uploadFilePath}\""
execOptions += " -u ${userName}:${password}"
execOptions += " sftp://${hostName}/${absolutePath}"

def ant = new AntBuilder()

/*
 *
 *    The command executed by curl will be logged in
 *    the logs/DocumentBurster.log file 
 *
 */
log.info("Executing command: curl.exe ${execOptions}")

/*
 * 
 *    1. http://groovy.codehaus.org/Executing%20External%20Processes%20From%20Groovy
 *    2. cURL is printing its logging operations to the logs/cURL.log file
 *   
 */
ant.exec(
		append: "true",
		failonerror: "true",
		output:"logs/cURL.log",
		executable: curlExecutable) {
			arg(line:"$execOptions")
		}
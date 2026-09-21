import groovy.ant.AntBuilder
// The bundled tools/curl/win/curl.exe is a Windows program (it ships in every package, but runs only there);
// every other OS uses its own curl (without this the script died with: Cannot run program "tools/curl/win/curl.exe").
def curlExecutable = System.getProperty('os.name').toLowerCase().contains('win') ? 'tools/curl/win/curl.exe' : 'curl'


def curlOptions =  message.uploadCommand

def ant = new AntBuilder()

/*
 *    The command executed by curl will be logged in
 *    the logs/DocumentBurster.log file
 */
log.info("Executing command: curl.exe ${curlOptions}")

/*
 *
 *    1. http://groovy.codehaus.org/Executing+External+Processes+From+Groovy
 *    2. cURL is printing its logging operations to the logs/cURL.log file
 *
 */
ant.exec(
	append: "true",
	failonerror: "true",
	failifexecutionfails: "true",
	output:"logs/cURL.log",
	executable: curlExecutable) {
				arg(line:"${curlOptions}")
	}
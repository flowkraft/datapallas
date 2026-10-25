param (
    [Parameter(Mandatory=$false)]
    [string]$scriptDir = $PWD  # Default to current working directory if not provided
)

# Check if the script is running with administrative privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    # Re-launch the script with a request for administrative privileges
    $scriptArgs = "-File `"$PSCommandPath`""
    if ($scriptDir) {
        $scriptArgs += " -scriptDir `"$scriptDir`""
    }
    try {
        # -Wait: the caller must not be told the server is stopped before the elevated script has done its work.
        $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $scriptArgs -Wait -PassThru
        # ... and it must be told what that work achieved: this exit code is the only one the caller sees.
        exit $elevated.ExitCode
    } catch {
        # The UAC question was answered No, or never answered at all: nothing was stopped.
        Write-Host "Error: could not run with administrator rights, nothing was stopped: $($_.Exception.Message)"
        exit 1
    }
}

# Define the path of the log file based on the RB_SERVER_MODE environment variable
$rbServerMode = [Environment]::GetEnvironmentVariable("RB_SERVER_MODE", "Process")
Write-Host "RB_SERVER_MODE (killOlderExesAndSpringBoots.ps1) is set to: $rbServerMode"

$logFilePath = if ($rbServerMode -eq "true") {
    Join-Path $env:PORTABLE_EXECUTABLE_DIR_PATH "logs\rbsj-server.log"
} else {
    Join-Path $env:PORTABLE_EXECUTABLE_DIR_PATH "logs\rbsj-exe.log"
}

# Check if the log file exists
if (-Not (Test-Path $logFilePath)) {
    Write-Host "Error: Log file not found at $logFilePath"
    exit
}


# Try to find the line with the PID and parse it using a regular expression
$pidLine = Select-String -Path $logFilePath -Pattern "with PID (\d+)" -AllMatches
if ($pidLine) {
    $pidExistingSpringBoot = $pidLine.Matches.Groups[1].Value
    Write-Host "Java PID: $pidExistingSpringBoot"
    
    # Kill the Java process using the PID
	Write-Host "Killing Java process with PID: $pidExistingSpringBoot"
	do {
		Stop-Process -Id $pidExistingSpringBoot -Force -ErrorAction SilentlyContinue
		Start-Sleep -Seconds 1  # Wait for a short period to give the process time to stop
	} while (Get-Process -Id $pidExistingSpringBoot -ErrorAction SilentlyContinue)
	Write-Host "Java process with PID: $pidExistingSpringBoot has been killed"

} else {
    Write-Host "No Java process found in log file."
}

Remove-Item -Path $logFilePath -ErrorAction Ignore

# Existing functionality to manage DataPallas.exe processes
$processes = Get-Process -Name DataPallas -ErrorAction SilentlyContinue
if ($scriptDir) {
    $processes = $processes | Where-Object {$_.Path -like "$scriptDir\*"}
}

# Add the start time and executable path to each process
$processes = $processes | ForEach-Object {
    try {
        $processId = $_.Id
        $query = "SELECT CreationDate, ExecutablePath FROM Win32_Process WHERE ProcessId = $processId"
        $searcher = New-Object System.Management.ManagementObjectSearcher($query)
        $result = $searcher.Get() | Select-Object -First 1
        $_ | Add-Member -NoteProperty StartTime ($result.CreationDate)
        $_ | Add-Member -NoteProperty Path ($result.ExecutablePath)
    } catch {
        Write-Host "Failed to retrieve details for process ID $processId"
    }
    $_
}

# Sort the processes by start time in descending order
$sortedProcesses = $processes | Sort-Object StartTime -Descending

# If there are more than one process, kill all but the newest one
if ($sortedProcesses.Count -gt 1) {
    $sortedProcesses | Select-Object -Skip 1 | ForEach-Object {
        Write-Host "Stopping older DataPallas process with ID: $($_.Id)"
        Stop-Process -Id $_.Id -Force
    }
}

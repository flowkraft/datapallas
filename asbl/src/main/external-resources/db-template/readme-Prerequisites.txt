Java Requirement
--------------
DataPallas requires Java version 17 specifically to run properly.

Note 1: DataPallas will not work with Java versions before 17 and is not guaranteed to work with versions after 17 (though it is likely to work).
Note 2: Before installing, uninstalling, or changing Java versions, please verify that no other business-critical software on your computer depends on Java. Modifying Java installations may affect or break other Java-dependent applications.

Check Current Installation
-------------------------
1. Check if Java 17 is already installed:
   - Open PowerShell
   - Run:
   
   java -version
   
   If you see "version 17.x.x", Java 17 is already installed - no further action needed.
   If Java 17 is not installed, Chocolatey (Windows) package manager provides an easy way to install it.

2. Check if Chocolatey is installed:
   - In the same PowerShell window
   - Run:
   
   choco -v
   
   If you see a version number, Chocolatey is installed - skip to "Install Java 17".
   If you get an error, continue with "Install Chocolatey" below.

Installation Instructions
------------------------
1. Install Chocolatey Package Manager:
   - Open PowerShell as Administrator
   - Run this command:
   
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   
   Source: https://chocolatey.org/install
   - Close PowerShell

2. Install Java 17:
   - Open a new PowerShell window as Administrator
   - Run:
   
   choco install temurin17 --yes

Uninstallation (if needed)
-------------------------
To remove Java 17:
- Open PowerShell as Administrator
- Run:

choco uninstall temurin17 --yes


Docker Requirement (Optional)
-----------------------------
Docker is an OPTIONAL dependency. The core DataPallas features work without it.

Works WITHOUT Docker:
- Report bursting
- Report generation

Requires Docker:
- Apps, CMS, Dashboards, Canvas UI
- Database Starter Packs
- Other capabilities that run as containerized services

If you only use the core features above, you can skip this section entirely.
Install Docker only when you want to use one of the Docker-dependent capabilities.

Note: Docker Desktop is a large download and, after installation, usually requires
a computer restart before it can be used.

Check Current Installation
-------------------------
1. Check if Docker is already installed:
   - Open PowerShell
   - Run:

   docker --version

   If you see a version number, Docker is already installed - no further action needed.
   If you get an error, Chocolatey (Windows) package manager provides an easy way to install it.
   (If Chocolatey is not yet installed, follow "Install Chocolatey Package Manager" above first.)

Installation Instructions
------------------------
Install Docker Desktop:
- Open PowerShell as Administrator
- Run:

choco install docker-desktop --yes

Source: https://www.docker.com/products/docker-desktop/
- Restart your computer when prompted, then start Docker Desktop once to finish setup.

Uninstallation (if needed)
-------------------------
To remove Docker Desktop:
- Open PowerShell as Administrator
- Run:

choco uninstall docker-desktop --yes
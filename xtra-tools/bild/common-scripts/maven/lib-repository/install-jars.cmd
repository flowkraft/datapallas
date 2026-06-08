:: install on the local maven repository either

:: 1. jars which are not available on public maven repositories or
:: 2. jars which are old on the public maven repositories

:: Step 1 - install jpoller1.5.2 - Directory Poller

:: Step 2 - install Pherialize

call mvn install:install-file -Dfile=./burst/pherialize-1.2.1.jar -DgroupId=de.ailis.pherialize -DartifactId=pherialize -Dversion=1.2.1 -Dpackaging=jar

:: Step 3 - install jPDFUnit + its old pdfbox (test-only PDF assertions). Neither
:: is on Maven Central; vendoring them here lets us drop the jboss-public repo.

call mvn install:install-file -Dfile=./burst/jpdfunit-1.1.jar -DgroupId=net.sf.jpdfunit -DartifactId=jpdfunit -Dversion=1.1 -Dpackaging=jar

call mvn install:install-file -Dfile=./burst/pdfbox-0.7.2.jar -DgroupId=pdfbox -DartifactId=pdfbox -Dversion=0.7.2 -Dpackaging=jar
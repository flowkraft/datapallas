package com.sourcekraft.documentburster.assembly;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;

import org.zeroturnaround.exec.ProcessExecutor;
import org.zeroturnaround.exec.stream.LogOutputStream;
import org.zeroturnaround.zip.ZipUtil;
import org.apache.commons.io.FileUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DockerAssembler extends AbstractAssembler {

    private String imageTag;
    private String version = "latest";

    public DockerAssembler() {
        // Package the docker bundle into a zip so it can be distributed and verified
        super("target/package/docker", "target/package/verified-docker", "target/datapallas-server-docker.zip");
        // default imageTag uses latest until we read version from settings.xml
        this.imageTag = "flowkraft/datapallas-server:latest";
    }

    @Override
    protected void compile() throws Exception {
        // Determine version from the assembled NoExe package or fallback to template
        this.version = _readVersionFromSettingsXml();
        if (this.version == null || this.version.trim().isEmpty()) {
            this.version = "latest";
        }
        this.imageTag = "flowkraft/datapallas-server:" + this.version;

        System.out.println("------------------------------------- START: DockerAssembler.compile() building Docker image '" + imageTag + "' ... -------------------------------------");

        File top = new File(Utils.getTopProjectFolderPath());

        // Preprocess Dockerfile to inject the correct version label
        File dockerfileSource = new File(top, "Dockerfile");
        File dockerfileBuild = new File(top, "Dockerfile.assembled");
        _preprocessDockerfile(dockerfileSource, dockerfileBuild, this.version);

        // Try to remove any existing image (ignore failures)
        try {
            new ProcessExecutor().directory(top).command("docker", "rmi", "-f", imageTag)
                    .redirectOutput(new LogOutputStream() {
                        @Override
                        protected void processLine(String line) {
                            System.out.println(line);
                        }
                    }).execute();
        } catch (Throwable t) {
            System.out.println("Docker rmi: image not present or removal failed (ignored): " + t.getMessage());
        }

        // Build the Docker image without cache using the preprocessed Dockerfile
        int buildExitCode = new ProcessExecutor().directory(top)
                .command("docker", "build", "--no-cache", "-t", imageTag, "-t", "flowkraft/datapallas-server:latest", "-f", dockerfileBuild.getName(), ".")
                .redirectOutput(new LogOutputStream() {
                    @Override
                    protected void processLine(String line) {
                        System.out.println(line);
                    }
                }).execute().getExitValue();

        if (buildExitCode != 0) {
            throw new RuntimeException("docker build failed (exit " + buildExitCode + ") for image " + imageTag);
        }

        // cleanup generated Dockerfile (best-effort)
        try {
            dockerfileBuild.delete();
        } catch (Exception ex) {
            // ignore
        }

        System.out.println("------------------------------------- DONE: DockerAssembler.compile() built image '" + imageTag + "' ... -------------------------------------");
    }

    @Override
    protected void preparePackage() throws Exception {
        System.out.println("------------------------------------- START: DockerAssembler.preparePackage() ... -------------------------------------");

        // Generate a docker-compose.yml that uses 'latest' by default and comments the pinned version
        File templateCompose = new File(Utils.getTopProjectFolderPath() + "/asbl/docker/docker-compose.yml");
        String composeContent = FileUtils.readFileToString(templateCompose, "UTF-8");

        // Replace image line with two lines: pinned version active and commented unpinned 'latest'
        // Preserve indentation by capturing leading whitespace and reusing it in the replacement
        composeContent = composeContent.replaceAll("(?m)^(\\s*)image:\\s*flowkraft/datapallas-server:\\S+",
                "$1image: flowkraft/datapallas-server:" + this.version + "\n$1# unpinned: image: flowkraft/datapallas-server:latest");

        // Write the compose file at the root of the assembled DataPallas bundle
        File bundleRoot = new File(packageDirPath + "/" + this.topFolderName);
        File outCompose = new File(bundleRoot, "docker-compose.yml");
        FileUtils.writeStringToFile(outCompose, composeContent, "UTF-8");

        // Ship the operator README next to the compose file. Without it the bundle
        // extracts to thirteen data folders and a compose file with no instructions -
        // not even the credentials needed to get past the login screen.
        File dockerSourceDir = new File(Utils.getTopProjectFolderPath() + "/asbl/docker");
        FileUtils.copyFile(new File(dockerSourceDir, "README.md"), new File(bundleRoot, "README.md"));

        System.out.println("Copied README.md into the bundle root");

        // Copy initial directories from the verified NoExe package into the assembled package directory
        // DIRECTORIES = ("_apps", "backup", "config", "db", "input-files", "logs", "output", "poll", "quarantine", "samples", "scripts", "temp", "templates")
        String[] directories = new String[] {"_apps", "backup", "config", "db", "input-files", "logs", "output", "poll", "quarantine", "samples", "scripts", "temp", "templates"};
        File verifiedRoot = new File(Utils.getTopProjectFolderPath() + "/asbl/target/package/verified-db-noexe/DataPallas");

        for (String dir : directories) {
            File src = new File(verifiedRoot, dir);
            File dest = new File(packageDirPath + "/" + this.topFolderName + "/" + dir);
            if (src.exists() && src.isDirectory()) {
                System.out.println("Copying directory from verified package: " + src.getPath() + " -> " + dest.getPath());
                FileUtils.copyDirectory(src, dest);
            } else {
                // Ensure the destination folder exists even if the source is missing (create empty dir)
                System.out.println("Source not present for '" + dir + "' in verified package; creating empty folder: " + dest.getPath());
                FileUtils.forceMkdir(dest);
            }
        }

        // Post-process packaged config to ensure Docker defaults (host/mailhog/runtime) are set
        File packagedBurst = new File(packageDirPath + "/" + this.topFolderName + "/config/burst/settings.xml");
        String bc = FileUtils.readFileToString(packagedBurst, "UTF-8");
        bc = bc.replaceAll("(?is)<host\\b[^>]*>\\s*localhost\\s*</host>", "<host>mailhog</host>");
        bc = bc.replaceAll("(?is)<weburl\\b[^>]*>\\s*https?://localhost:8025\\s*</weburl>", "<weburl>http://mailhog:8025</weburl>");
        FileUtils.writeStringToFile(packagedBurst, bc, "UTF-8");
        System.out.println("Patched packaged burst/settings.xml for docker defaults");

        File packagedInternal = new File(packageDirPath + "/" + this.topFolderName + "/config/_internal/settings.xml");
        String ic = FileUtils.readFileToString(packagedInternal, "UTF-8");
        ic = ic.replaceAll("(?is)<runtime\\b[^>]*>\\s*windows\\s*</runtime>", "<runtime>docker</runtime>");
        FileUtils.writeStringToFile(packagedInternal, ic, "UTF-8");
        System.out.println("Patched packaged _internal/settings.xml runtime to docker");

        System.out.println("------------------------------------- DONE: DockerAssembler.preparePackage() wrote docker/ bundle with version '" + this.version + "' ... -------------------------------------");
    }

    @Override
    public void verify() throws Exception {
        // Ensure image exists by checking docker images -q <tag>
        File top = new File(Utils.getTopProjectFolderPath());
        org.zeroturnaround.exec.ProcessResult pr = new ProcessExecutor().directory(top).command("docker", "images", "-q", imageTag)
                .readOutput(true).execute();

        String imageId = pr.getOutput().getString().trim();
        assertThat(imageId).as("Docker image %s should exist", imageTag).isNotEmpty();

        // ---------------------------------------------------------------------
        // Read settings files from the built image and verify versions
        // (read from /app/config/_defaults/settings.xml and /app/config/burst/settings.xml inside image)
        // ---------------------------------------------------------------------
        String defaultsContent;
        String burstContent;
        try {
            defaultsContent = new ProcessExecutor().directory(top)
                    .command("docker", "run", "--rm", "--entrypoint", "cat", imageTag, "/app/config/_defaults/settings.xml")
                    .readOutput(true).execute().getOutput().getString();
        } catch (Throwable t) {
            throw new RuntimeException("Failed to read /app/config/_defaults/settings.xml from image " + imageTag + ": " + t.getMessage(), t);
        }

        try {
            burstContent = new ProcessExecutor().directory(top)
                    .command("docker", "run", "--rm", "--entrypoint", "cat", imageTag, "/app/config/burst/settings.xml")
                    .readOutput(true).execute().getOutput().getString();
        } catch (Throwable t) {
            throw new RuntimeException("Failed to read /app/config/burst/settings.xml from image " + imageTag + ": " + t.getMessage(), t);
        }

        String defaultsVersion = null;
        String burstVersion = null;

        Matcher dm = Pattern.compile("<version>([^<]+)</version>").matcher(defaultsContent);
        if (dm.find()) {
            defaultsVersion = dm.group(1).trim();
        }

        Matcher bm = Pattern.compile("<version>([^<]+)</version>").matcher(burstContent);
        if (bm.find()) {
            burstVersion = bm.group(1).trim();
        }

        assertThat(defaultsVersion).as("version tag missing in image:/app/config/_defaults/settings.xml").isNotNull();
        assertThat(burstVersion).as("version tag missing in image:/app/config/burst/settings.xml").isNotNull();
        assertThat(defaultsVersion).isEqualTo(burstVersion);
        assertThat(burstVersion).isEqualTo(this.version);

        // Optionally check image label 'version' if present (use JSON inspect to avoid template parsing errors)
        try {
            String labelsJson = new ProcessExecutor().directory(top)
                    .command("docker", "image", "inspect", "--format", "{{ json .Config.Labels }}", imageTag)
                    .readOutput(true).execute().getOutput().getString().trim();
            if (labelsJson != null && !labelsJson.isEmpty() && !labelsJson.equals("null")) {
                try {
                    ObjectMapper mapper = new ObjectMapper();
                    JsonNode root = mapper.readTree(labelsJson);
                    JsonNode v = root.get("version");
                    if (v != null && !v.asText().isEmpty()) {
                        assertThat(v.asText()).isEqualTo(this.version);
                    } // else: no version label present, silently skip
                } catch (Exception ex) {
                    System.out.println("Warning: failed to parse image labels JSON: " + ex.getMessage());
                }
            }
        } catch (Throwable t) {
            System.out.println("Warning: failed to read image label version: " + t.getMessage());
        }

        ZipUtil.unpack(new File(targetPathZipFile), new File(verifyDirPath));

        // ---------------------------------------------------------------------
        // Verify host-side verified package (verifyDirPath) matches the image
        // ---------------------------------------------------------------------
        File hostVerifiedRoot = new File(verifyDirPath + "/" + this.topFolderName);
        File hostDefaultsSettings = new File(hostVerifiedRoot, "config/_defaults/settings.xml");
        File hostBurstSettings = new File(hostVerifiedRoot, "config/burst/settings.xml");

        assertThat(hostVerifiedRoot.exists()).as("Expected host verified package folder %s to exist", hostVerifiedRoot.getPath()).isTrue();
        assertThat(hostDefaultsSettings.exists()).as("Expected %s to exist", hostDefaultsSettings.getPath()).isTrue();
        assertThat(hostBurstSettings.exists()).as("Expected %s to exist", hostBurstSettings.getPath()).isTrue();

        String hostDefaultsContent = FileUtils.readFileToString(hostDefaultsSettings, "UTF-8");
        String hostBurstContent = FileUtils.readFileToString(hostBurstSettings, "UTF-8");

        // Verify the packaged burst settings were patched for Docker
        File hostInternalSettings = new File(hostVerifiedRoot, "config/_internal/settings.xml");
        assertThat(hostInternalSettings.exists()).as("Expected %s to exist", hostInternalSettings.getPath()).isTrue();
        String hostInternalContent = FileUtils.readFileToString(hostInternalSettings, "UTF-8");
        assertThat(hostBurstContent).as("Expected burst settings to reference mailhog").contains("mailhog");
        assertThat(hostBurstContent).as("Expected burst settings to reference mailhog weburl").contains("http://mailhog:8025");
        assertThat(hostInternalContent).as("Expected runtime to be docker in %s", hostInternalSettings.getPath()).contains("<runtime>docker</runtime>");

        // ---------------------------------------------------------------------
        // Verify the bundle is usable, not merely present: a user who extracts the
        // zip must find instructions, including the default sign-in credentials.
        // ---------------------------------------------------------------------
        File bundleReadme = new File(hostVerifiedRoot, "README.md");
        assertThat(bundleReadme.exists()).as("Expected %s to exist", bundleReadme.getPath()).isTrue();
        assertThat(FileUtils.readFileToString(bundleReadme, "UTF-8"))
                .as("Bundle README must state the default credentials, or the login screen is a dead end")
                .contains("burst");

        String hostDefaultsVersion = null;
        String hostBurstVersion = null;

        Matcher hm1 = Pattern.compile("<version>([^<]+)</version>").matcher(hostDefaultsContent);
        if (hm1.find()) {
            hostDefaultsVersion = hm1.group(1).trim();
        }
        Matcher hm2 = Pattern.compile("<version>([^<]+)</version>").matcher(hostBurstContent);
        if (hm2.find()) {
            hostBurstVersion = hm2.group(1).trim();
        }

        assertThat(hostDefaultsVersion).as("version tag missing in %s", hostDefaultsSettings.getPath()).isNotNull();
        assertThat(hostBurstVersion).as("version tag missing in %s", hostBurstSettings.getPath()).isNotNull();

        // host versions must match the image/builder version
        assertThat(hostDefaultsVersion).isEqualTo(defaultsVersion);
        assertThat(hostBurstVersion).isEqualTo(burstVersion);

        // ---------------------------------------------------------------------
        // Verify docker-compose bundle contains the pinned version comment
        // ---------------------------------------------------------------------
        File composeFile = new File(packageDirPath + "/" + this.topFolderName + "/docker-compose.yml");
        assertThat(composeFile.exists()).as("Expected compose file %s to exist", composeFile.getPath()).isTrue();

        String compose = FileUtils.readFileToString(composeFile, "UTF-8");
        Matcher pm = Pattern.compile("(?m)^\\s*image:\\s*\\S*:(\\S+)").matcher(compose);
        assertThat(pm.find()).as("Image line should be present in %s", composeFile.getPath()).isTrue();
        String pinnedVersion = pm.group(1).trim();
        assertThat(pinnedVersion).isEqualTo(this.version);

        System.out.println("------------------------------------- VERIFIED: DockerAssembler image exists: " + imageId + " and versions are consistent: " + this.version + " ... -------------------------------------");
    }

    private String _readVersionFromSettingsXml() {
        try {
            // Prefer the assembled settings.xml produced by NoExeAssembler
            File settingsPath = new File(Utils.getTopProjectFolderPath()
                    + "/asbl/target/package/verified-db-noexe/DataPallas/config/burst/settings.xml");
            if (!settingsPath.exists()) {
                // fallback to template settings.xml in backend resources
                settingsPath = new File(Utils.getTopProjectFolderPath()
                        + "/bkend/reporting/src/main/external-resources/template/config/burst/settings.xml");
            }

            if (!settingsPath.exists()) {
                System.out.println("Warning: settings.xml not found to read version; defaulting to 'latest'");
                return null;
            }

            String content = FileUtils.readFileToString(settingsPath, "UTF-8");
            Matcher m = Pattern.compile("<version>([^<]+)</version>").matcher(content);
            if (m.find()) {
                return m.group(1).trim();
            }
        } catch (Exception ex) {
            System.out.println("Failed to read version from settings.xml: " + ex.getMessage());
        }
        return null;
    }

    private void _preprocessDockerfile(File src, File dst, String version) {
        try {
            String content = FileUtils.readFileToString(src, "UTF-8");

            // Anchored to a LABEL continuation line, so it patches the version labels and
            // nothing else. Also matches org.opencontainers.image.version, which carries
            // the same placeholder. An unanchored version="..." replace would silently
            // rewrite every other occurrence that ever lands in this file.
            content = content.replaceAll(
                    "(?m)^([ \\t]*)((?:org\\.opencontainers\\.image\\.)?version)[ \\t]*=[ \\t]*\"[^\"]*\"",
                    "$1$2=\"" + version + "\"");

            FileUtils.writeStringToFile(dst, content, "UTF-8");
        } catch (Exception ex) {
            System.out.println("Failed to preprocess Dockerfile: " + ex.getMessage());
        }
    }

}

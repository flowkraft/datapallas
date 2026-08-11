package com.flowkraft.license;

import java.io.File;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.flowkraft.reports.ReportsService;
import com.flowkraft.common.Utils;
import com.flowkraft.common.AppPaths;
import com.flowkraft.jobs.services.JobExecutionService;
import com.flowkraft.license.model.LicenseDetails;
import com.sourcekraft.documentburster.utils.LicenseUtils;

@Service
public class LicenseService {

	private static final Logger log = LoggerFactory.getLogger(LicenseService.class);

	@Autowired
	ReportsService settingsService;

	@Autowired
	private JobExecutionService jobExecutionService;

	// WORKSPACE_DIR_PATH already ends in "config/", and the licence has always lived in _internal —
	// the same file bkend/common's License and the updater read.
	private String licenseFilePath = AppPaths.WORKSPACE_DIR_PATH + "_internal/license.xml";

	public void activateLicense() throws Throwable {
		jobExecutionService.executeSync(new String[] { "system", "license", "activate" });
	}

	public void deActivateLicense() throws Throwable {
		jobExecutionService.executeSync(new String[] { "system", "license", "deactivate" });
	}

	public void checkLicense() throws Throwable {
		jobExecutionService.executeSync(new String[] { "system", "license", "check" });
	}

	public LicenseDetails loadLicenseFile() throws Exception {

		JAXBContext jc = JAXBContext.newInstance(LicenseDetails.class);

		Unmarshaller u = jc.createUnmarshaller();

		return (LicenseDetails) u.unmarshal(new File(this.licenseFilePath));

	}

	public void saveLicenseFile(LicenseDetails licenseInfo) throws Exception {

		JAXBContext jc = JAXBContext.newInstance(LicenseDetails.class);
		Marshaller m = jc.createMarshaller();
		m.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, Boolean.TRUE);
		m.marshal(licenseInfo, new File(licenseFilePath));

	}

	public AboutInfo getLatestVersionAndChangeLogInformation() throws Exception {

		AboutInfo productInfo = new AboutInfo();

		productInfo.product = Utils.getProductName();

		//DocumentBursterSettings defaultSettings = this.settingsService.loadSettings("settings.xml");
		//productInfo.version = defaultSettings.settings.version;

		// Through LicenseUtils, which is the one place that talks to datapallas.com.
		//
		// It tries the bundled curl before the in-JVM client, because the JVM's own TLS stack is what
		// failed against that host in the field while curl kept working. A second HTTP client here —
		// JAX-RS, WebClient, anything — would quietly reintroduce the failure this product already
		// paid to discover, for the sake of a version number.
		try {

			JsonNode jsonNodeResult = new LicenseUtils().fetchLatestRelease();

			productInfo.latestversion = jsonNodeResult.path("version").asText(StringUtils.EMPTY);

			// Markdown now, not PHP-serialized HTML. The old store returned the
			// changelog inside a Pherialize blob because it was WordPress; the new
			// one just returns the text, so there is nothing to unpack and no <p>
			// tags to strip back out.
			productInfo.changelog = jsonNodeResult.path("changelog").asText(StringUtils.EMPTY);

		} catch (Exception e) {
			// The products server being unreachable must not break the About screen — it only means
			// there is nothing to say about a newer version.
			log.warn("Failed to fetch latest version/changelog from the products server", e);
			productInfo.changelog = StringUtils.EMPTY;
			productInfo.latestversion = StringUtils.EMPTY;
		}

		return productInfo;

	}

	// A trust-everything HTTPS client used to live here, to work around a broken
	// certificate on the old pdfburst.com host. It is gone with the host: the
	// default trust store is used, so this call can no longer be intercepted.

}

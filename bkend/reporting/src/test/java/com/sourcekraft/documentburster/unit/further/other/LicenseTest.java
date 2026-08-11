/*
    DocumentBurster is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    DocumentBurster is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with DocumentBurster.  If not, see <http://www.gnu.org/licenses/>
 */
package com.sourcekraft.documentburster.unit.further.other;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import java.io.File;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.RandomStringUtils;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;

import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.utils.LicenseUtils;

public class LicenseTest {

	private static final String licenseXmlPath = "../../asbl/src/main/external-resources/db-template/config/_internal/license.xml";

	private static final String TEST_LICENSE_KEY = System.getProperty("TEST_LICENSE_KEY") != null
			? System.getProperty("TEST_LICENSE_KEY")
			: "51b0aa18f2bbc066efdca8b53c2dacc8";

	private LicenseUtils _getTestLicenseUtils() throws Exception {
		String randomTestLicenseXmlPath = TestsUtils.TESTS_OUTPUT_FOLDER + "/"
				+ RandomStringUtils.random(10, true, false) + ".xml";
		File randomTestLicenseXmlFile = new File(randomTestLicenseXmlPath);

		FileUtils.copyFile(new File(licenseXmlPath), randomTestLicenseXmlFile);

		LicenseUtils licenseUtils = new LicenseUtils();
		licenseUtils.setLicenseFilePath(randomTestLicenseXmlPath);
		licenseUtils.getLicense().loadLicense();
		licenseUtils.getLicense().setKey(TEST_LICENSE_KEY);
		licenseUtils.getLicense().setStatus("valid");
		licenseUtils.getLicense().saveLicense();

		return licenseUtils;
	}

	@Before
	public void init() throws Exception {

		_getTestLicenseUtils().deActivateLicense();

	}

	@After
	public void teardown() throws Exception {

		_getTestLicenseUtils().deActivateLicense();

	}

	@Test
	public final void shouldActivateCheckAndDeactivateLicense() throws Exception {

		LicenseUtils licenseUtils = _getTestLicenseUtils();

		licenseUtils.deActivateLicense();
		licenseUtils.getLicense().loadLicense();
		assertEquals(licenseUtils.getLicense().getStatus(), "deactivated");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

		licenseUtils.checkLicense();
		licenseUtils.getLicense().loadLicense();

		// Everything from here on asks the live licence server for a verdict. When
		// it cannot be reached there is no verdict to assert, so the test stands
		// down rather than reporting a red build for something that is not in this
		// codebase. Note what is NOT skipped: the deactivation above, which is
		// local, and the fact that an unreachable server produced
		// "licensing-server-down" instead of throwing or wrongly claiming "valid".
		Assume.assumeFalse("Skipped — the licence server could not be reached",
				licenseUtils.getLicense().isServerDown());

		assertEquals(licenseUtils.getLicense().getStatus(), "valid");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

		licenseUtils.deActivateLicense();
		licenseUtils.getLicense().loadLicense();
		assertEquals(licenseUtils.getLicense().getStatus(), "deactivated");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

		licenseUtils.activateLicense();
		licenseUtils.getLicense().loadLicense();
		assertEquals(licenseUtils.getLicense().getStatus(), "valid");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

		licenseUtils.checkLicense();
		licenseUtils.getLicense().loadLicense();
		assertEquals(licenseUtils.getLicense().getStatus(), "valid");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

		licenseUtils.deActivateLicense();
		licenseUtils.getLicense().loadLicense();
		assertEquals(licenseUtils.getLicense().getStatus(), "deactivated");
		assertNotEquals("license@exception", licenseUtils.getLicense().getCustomerEmail());

	};

}

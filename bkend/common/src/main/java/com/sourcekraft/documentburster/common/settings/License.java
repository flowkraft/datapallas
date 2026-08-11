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
package com.sourcekraft.documentburster.common.settings;

import java.io.File;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;
import jakarta.xml.bind.Unmarshaller;

import org.apache.commons.lang3.StringUtils;
import com.sourcekraft.documentburster.utils.Utils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.settings.model.license.LicenseDetails;

public class License {

	private Logger log = LoggerFactory.getLogger(License.class);

	private String licenseFilePath = "config/_internal/license.xml";

	private LicenseDetails licenseDetails = new LicenseDetails();
	private boolean mockPaid = false;

	public static String STATUS_DEMO = "DEMO";
	public static String STATUS_VALID = "VALID";
	public static String STATUS_EXPIRED = "EXPIRED";

	/**
	 * The licence server could not be reached, so the licence could not be
	 * confirmed either way.
	 *
	 * <p>
	 * Deliberately its own value rather than plain "invalid". The key may be
	 * perfectly good and we simply could not ask, and knowing that is the
	 * difference between a support call about a broken licence and one about a
	 * blocked port. It still <em>counts</em> as invalid — see {@link #isInvalid()}
	 * — because an unconfirmed licence must not look active, and the licence screen
	 * shows it as such without needing to know this value exists.
	 */
	public static String STATUS_SERVER_DOWN = "licensing-server-down";

	public String getLicenseFilePath() {
		return this.licenseFilePath;
	}

	public void setLicenseFilePath(String licenseFilePath) {
		this.licenseFilePath = licenseFilePath;
	}

	public void loadLicense() throws Exception {

		JAXBContext jc = JAXBContext.newInstance(LicenseDetails.class);

		Unmarshaller u = jc.createUnmarshaller();

		String resolvedPath = Utils.resolvePathAgainstPortableDir(this.licenseFilePath);
		licenseDetails = (LicenseDetails) u.unmarshal(new File(resolvedPath));

		log.debug("loadLicense - license = [" + licenseDetails + "]");

	}

	public void saveLicense() throws Exception {

		log.debug("saveLicense - licenseFilePath='" + licenseFilePath + "', license = [" + licenseDetails + "]");

		JAXBContext jc = JAXBContext.newInstance(LicenseDetails.class);
		Marshaller m = jc.createMarshaller();
		m.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, Boolean.TRUE);
		m.marshal(licenseDetails, new File(Utils.resolvePathAgainstPortableDir(licenseFilePath)));

	}

	public String getKey() {
		return licenseDetails.key;
	};

	public String getProduct() {
		return licenseDetails.product;
	};

	public String getStatus() {
		return licenseDetails.status;
	};

	public String getCustomerName() {
		return licenseDetails.customername;
	};

	public String getCustomerEmail() {
		return licenseDetails.customeremail;
	};

	public String getExpires() {
		return licenseDetails.expires;
	};

	public String getWhatsNew() {
		return licenseDetails.changelog;
	};

	public void setKey(String key) {
		licenseDetails.key = key;
	};

	public void setProduct(String product) {
		licenseDetails.product = product;
	};

	public void setStatus(String status) {
		licenseDetails.status = status;
	};

	public void setCustomerName(String customerName) {
		licenseDetails.customername = customerName;
	};

	public void setCustomerEmail(String customerEmail) {
		licenseDetails.customeremail = customerEmail;
	};

	public void setExpires(String expires) {
		licenseDetails.expires = expires;
	};

	public void setChangeLog(String changeLog) {
		licenseDetails.changelog = changeLog;
	};

	public void setLatestVersion(String latestVersion) {
		licenseDetails.latestversion = latestVersion;
	};

	// --- Licence server accessors ---

	public String getInstanceId() {
		return licenseDetails.instanceid;
	};

	public void setInstanceId(String instanceId) {
		licenseDetails.instanceid = instanceId;
	};

	public String getLicenseId() {
		return licenseDetails.licenseid;
	};

	public void setLicenseId(String licenseId) {
		licenseDetails.licenseid = licenseId;
	};

	public String getLicenseType() {
		return licenseDetails.licensetype;
	};

	public void setLicenseType(String licenseType) {
		licenseDetails.licensetype = licenseType;
	};

	public String getSeats() {
		return licenseDetails.seats;
	};

	public void setSeats(String seats) {
		licenseDetails.seats = seats;
	};

	public String getMaintenanceUntil() {
		return licenseDetails.maintenanceuntil;
	};

	public void setMaintenanceUntil(String maintenanceUntil) {
		licenseDetails.maintenanceuntil = maintenanceUntil;
	};

	public boolean isValid() {
		return getStatus().equalsIgnoreCase("valid");
	}

	public boolean isExpired() {
		return getStatus().equalsIgnoreCase("expired");
	}

	/**
	 * May this installation use the features it paid for?
	 *
	 * <p>
	 * When the licence server cannot be reached this falls back to the last verdict
	 * it gave. That is the difference between an outage being our problem and it
	 * being the customer's: someone confirmed valid yesterday keeps working today,
	 * while their licence screen honestly says we could not confirm it. An
	 * installation that has never been confirmed gets nothing from an outage, so
	 * blocking the licence server is not a way in.
	 */
	public boolean itWasPaid() {

		if (mockPaid)
			return true;

		if (isServerDown())
			return lastVerdictWasPaid();

		return (isValid() || isExpired());
	}

	/** Whether the last answer we actually received was one that grants features. */
	private boolean lastVerdictWasPaid() {
		String verdict = StringUtils.trimToEmpty(licenseDetails.lastverdict);
		return verdict.equalsIgnoreCase("valid") || verdict.equalsIgnoreCase("expired");
	}

	public String getLastVerdict() {
		return licenseDetails.lastverdict;
	};

	public void setLastVerdict(String lastVerdict) {
		licenseDetails.lastverdict = lastVerdict;
	};

	public boolean isInvalid() {
		return getStatus().equalsIgnoreCase("invalid") || isServerDown();
	}

	/**
	 * True when the last answer was "we could not ask", rather than "no".
	 *
	 * <p>
	 * Note what this does NOT do: it does not stop anything. The software keeps
	 * running while the server is unreachable — a run is capped the way an
	 * unlicensed one is, but no job is refused and nothing throws. Our outage is
	 * not the customer's problem.
	 */
	public boolean isServerDown() {
		return getStatus().equalsIgnoreCase(STATUS_SERVER_DOWN);
	}

	public boolean isDemo() {
		return StringUtils.isEmpty(getStatus());
	}

	public void setMockPaid(boolean mockPaid) {
		this.mockPaid = mockPaid;
	}

}

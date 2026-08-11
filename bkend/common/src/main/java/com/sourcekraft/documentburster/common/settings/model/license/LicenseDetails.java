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
package com.sourcekraft.documentburster.common.settings.model.license;

import jakarta.xml.bind.annotation.XmlRootElement;

import org.apache.commons.lang3.StringUtils;

import com.sourcekraft.documentburster.utils.DumpToString;

@XmlRootElement(name = "license")
public class LicenseDetails extends DumpToString {

	/**
	 *
	 */
	private static final long serialVersionUID = -142182984693841240L;

	// --- Existing fields. The Angular UI and the local /system/license/*
	// endpoints read these, so their names and meanings must not change. ---
	public String key = StringUtils.EMPTY;
	public String product = StringUtils.EMPTY;
	public String status = StringUtils.EMPTY;
	public String expires = StringUtils.EMPTY;

	public String customername = StringUtils.EMPTY;
	public String customeremail = StringUtils.EMPTY;

	public String latestversion = StringUtils.EMPTY;
	public String changelog = StringUtils.EMPTY;

	// --- datapallas.com licence server ---
	//
	// The server answers "is this key valid?" on every check, as the old store
	// did. Nothing below is a credential; it is what the answer was about, kept
	// so the licence screen can show it and so a deactivation knows what to
	// release.

	/**
	 * Stable identifier for THIS installation, generated once and kept for the
	 * life of the install. It is what lets the licence server count seats — the
	 * old protocol had no machine identity at all, so it never could.
	 */
	public String instanceid = StringUtils.EMPTY;

	/** Server-side licence id, needed to deactivate. */
	public String licenseid = StringUtils.EMPTY;

	/** What kind of licence this is — only a trial or an NFR is time-limited. */
	public String licensetype = StringUtils.EMPTY;

	/** Seats this licence grants. */
	public String seats = StringUtils.EMPTY;

	/** Maintenance end date, as reported by the licence server. */
	public String maintenanceuntil = StringUtils.EMPTY;

	/**
	 * The last verdict the licence server actually gave — "valid", "expired" or
	 * "invalid".
	 *
	 * <p>
	 * Separate from {@link #status} because the two answer different questions once
	 * the server is unreachable. {@code status} becomes
	 * "licensing-server-down" so the licence screen can say we could not confirm
	 * anything; this keeps the last thing we were told, so a customer who was
	 * confirmed yesterday is not cut off by an outage today. Blank means we have
	 * never had an answer, and then an outage grants nothing.
	 */
	public String lastverdict = StringUtils.EMPTY;

}

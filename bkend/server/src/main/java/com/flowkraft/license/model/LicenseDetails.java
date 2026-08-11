package com.flowkraft.license.model;

import jakarta.xml.bind.annotation.XmlRootElement;

import org.apache.commons.lang3.StringUtils;

import com.fasterxml.jackson.annotation.JsonIgnore;

@XmlRootElement(name = "license")
public class LicenseDetails {

	public String key = StringUtils.EMPTY;
    public String product = StringUtils.EMPTY;
    public String status = StringUtils.EMPTY;
    public String expires = StringUtils.EMPTY;

    public String customername = StringUtils.EMPTY;
    public String customeremail = StringUtils.EMPTY;

    public String latestversion = StringUtils.EMPTY;
    public String changelog = StringUtils.EMPTY;

    /**
     * Seat entitlements — how many tenants and users this license permits.
     *
     * <p>This is the entire coupling between DataPallas and the customer/billing portal. The portal
     * issues a license carrying a number; DataPallas enforces it locally when a tenant or user is
     * created. The portal never mirrors DataPallas users, because for a self-hosted install it could
     * never keep such a mirror correct — and a stale mirror is worse than none.
     *
     * <p>Blank or absent means unlimited, so every existing license and the desktop are unaffected.
     */
    public String maxtenants = StringUtils.EMPTY;
    public String maxusers = StringUtils.EMPTY;

    // --- Owned by the CLI-side model, carried here so the round trip is lossless ---
    //
    // saveLicenseFile() marshals THIS class over the whole of license.xml, and
    // JAXB writes only what the class declares. Without these fields, saving the
    // key from the licence screen deleted them — and the UI saves on every
    // keystroke. instanceid is what lets the licence server count seats, so each
    // save burned a fresh activation slot and orphaned the previous one;
    // licenseid is what a deactivation needs to release the seat at all;
    // lastverdict is the offline grace fallback, so an outage after a save
    // granted nothing.
    //
    // Not interpreted here. They are read and written by
    // com.sourcekraft.documentburster.common.settings.model.license.LicenseDetails,
    // which marshals over the same file. Any field added to either class belongs
    // in both.

    /** Stable per-installation id — how the licence server counts seats. */
    public String instanceid = StringUtils.EMPTY;

    /** Server-side licence id, without which a deactivation cannot release the seat. */
    public String licenseid = StringUtils.EMPTY;

    /** standard | subscription | trial | nfr. */
    public String licensetype = StringUtils.EMPTY;

    /** Seats this licence grants. */
    public String seats = StringUtils.EMPTY;

    /** Maintenance end date, as last reported by the licence server. */
    public String maintenanceuntil = StringUtils.EMPTY;

    /** The last verdict actually received — the offline fallback. */
    public String lastverdict = StringUtils.EMPTY;

    // @JsonIgnore on both, and it is not cosmetic.
    //
    // Jackson names a property from the GETTER, so getMaxTenants() declared a
    // second property "maxTenants" alongside the field "maxtenants". It had no
    // setter, so it was serialised but not accepted back: GET /api/system/license/
    // returned BOTH spellings, the UI PUT the whole object back exactly as it
    // received it, and the PUT died with
    //
    //   Unrecognized field "maxTenants" ... not marked as ignorable
    //
    // That 400 is why saving a licence key silently failed — the key never
    // reached license.xml, the field went blank on reload, and Activate then
    // refused with "License key is not defined", which looks like a different
    // bug entirely.
    //
    // These two are computed accessors for callers inside the app, not part of
    // the wire contract. The data is `maxtenants` / `maxusers`.

    /** @return the tenant limit, or 0 for unlimited. */
    @JsonIgnore
    public int getMaxTenants() {
        return parseLimit(maxtenants);
    }

    /** @return the user limit, or 0 for unlimited. */
    @JsonIgnore
    public int getMaxUsers() {
        return parseLimit(maxusers);
    }

    private static int parseLimit(String value) {
        if (StringUtils.isBlank(value))
            return 0;
        try {
            int parsed = Integer.parseInt(value.trim());
            return parsed > 0 ? parsed : 0;
        } catch (NumberFormatException e) {
            // A malformed entitlement must not lock an administrator out of user management.
            return 0;
        }
    }

}

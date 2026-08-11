package com.flowkraft.license.model;

import jakarta.xml.bind.annotation.XmlRootElement;

import org.apache.commons.lang3.StringUtils;

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

    /** @return the tenant limit, or 0 for unlimited. */
    public int getMaxTenants() {
        return parseLimit(maxtenants);
    }

    /** @return the user limit, or 0 for unlimited. */
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

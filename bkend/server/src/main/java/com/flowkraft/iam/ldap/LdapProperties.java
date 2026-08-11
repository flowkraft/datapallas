package com.flowkraft.iam.ldap;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Everything needed to point DataPallas at a corporate directory, and nothing else.
 *
 * <p>All of it is inert until {@link #enabled} is true. A downloaded DataPallas authenticates against
 * its own store and never reads these; switching to Active Directory or LDAP is meant to be a matter
 * of setting four or five properties, not of changing how the product works.
 *
 * <h2>Active Directory vs plain LDAP</h2>
 * Setting {@link #domain} selects Active Directory, which needs almost nothing else — AD accepts
 * {@code user@domain} and finds the account itself. Leaving it blank selects generic LDAP (OpenLDAP,
 * lldap, ApacheDS, 389 Directory), which needs to be told where to look via {@link #userDnPatterns}
 * or {@link #userSearchFilter}.
 */
@Component
@ConfigurationProperties(prefix = "datapallas.ldap")
public class LdapProperties {

	/** Off by default. Nothing in this package is constructed while it is false. */
	private boolean enabled = false;

	/** e.g. {@code ldap://dc01.corp.local:389} or {@code ldaps://dc01.corp.local:636}. */
	private String url = "";

	/**
	 * Active Directory domain, e.g. {@code corp.local}. Setting this switches to the AD provider,
	 * which is the simpler path when the directory is AD.
	 */
	private String domain = "";

	/** Generic LDAP: the root to search under, e.g. {@code dc=corp,dc=local}. */
	private String baseDn = "";

	/** Generic LDAP: direct bind patterns, e.g. {@code uid={0},ou=people}. Tried before searching. */
	private String[] userDnPatterns = {};

	/** Generic LDAP: search filter used when no DN pattern matches, e.g. {@code (uid={0})}. */
	private String userSearchFilter = "";

	/** Generic LDAP: subtree to search for users, e.g. {@code ou=people}. */
	private String userSearchBase = "";

	/** Optional service account for searching, when the directory disallows anonymous binds. */
	private String managerDn = "";
	private String managerPassword = "";

	/**
	 * Role given to a directory user the first time they sign in and no group mapping matched.
	 *
	 * <p>JOB_OPERATOR on purpose — the least privileged role there is. A directory can contain thousands
	 * of accounts, and the safe reading of "this person exists in the company" is "they may run a job and
	 * read its output" — not that they may author Groovy. Promote deliberately, per user or by group.
	 */
	private String defaultRole = "JOB_OPERATOR";

	/** Tenant a first-time directory user is placed in. */
	private String defaultTenant = "default";

	/**
	 * Directory group to DataPallas role, e.g. {@code DataPallas-Admins: ADMIN}.
	 *
	 * <p>The strongest match wins, so someone in both an admins group and a viewers group is an
	 * administrator rather than whichever the directory happened to list first.
	 */
	private Map<String, String> groupRoleMap = new LinkedHashMap<>();

	/** Where to look for groups. Only used when {@link #groupRoleMap} is non-empty. */
	private String groupSearchBase = "";
	private String groupSearchFilter = "(member={0})";

	// ---- getters / setters ----

	public boolean isEnabled() {
		return enabled;
	}

	public void setEnabled(boolean enabled) {
		this.enabled = enabled;
	}

	public String getUrl() {
		return url;
	}

	public void setUrl(String url) {
		this.url = url;
	}

	public String getDomain() {
		return domain;
	}

	public void setDomain(String domain) {
		this.domain = domain;
	}

	public String getBaseDn() {
		return baseDn;
	}

	public void setBaseDn(String baseDn) {
		this.baseDn = baseDn;
	}

	public String[] getUserDnPatterns() {
		return userDnPatterns;
	}

	public void setUserDnPatterns(String[] userDnPatterns) {
		this.userDnPatterns = userDnPatterns;
	}

	public String getUserSearchFilter() {
		return userSearchFilter;
	}

	public void setUserSearchFilter(String userSearchFilter) {
		this.userSearchFilter = userSearchFilter;
	}

	public String getUserSearchBase() {
		return userSearchBase;
	}

	public void setUserSearchBase(String userSearchBase) {
		this.userSearchBase = userSearchBase;
	}

	public String getManagerDn() {
		return managerDn;
	}

	public void setManagerDn(String managerDn) {
		this.managerDn = managerDn;
	}

	public String getManagerPassword() {
		return managerPassword;
	}

	public void setManagerPassword(String managerPassword) {
		this.managerPassword = managerPassword;
	}

	public String getDefaultRole() {
		return defaultRole;
	}

	public void setDefaultRole(String defaultRole) {
		this.defaultRole = defaultRole;
	}

	public String getDefaultTenant() {
		return defaultTenant;
	}

	public void setDefaultTenant(String defaultTenant) {
		this.defaultTenant = defaultTenant;
	}

	public Map<String, String> getGroupRoleMap() {
		return groupRoleMap;
	}

	public void setGroupRoleMap(Map<String, String> groupRoleMap) {
		this.groupRoleMap = groupRoleMap;
	}

	public String getGroupSearchBase() {
		return groupSearchBase;
	}

	public void setGroupSearchBase(String groupSearchBase) {
		this.groupSearchBase = groupSearchBase;
	}

	public String getGroupSearchFilter() {
		return groupSearchFilter;
	}

	public void setGroupSearchFilter(String groupSearchFilter) {
		this.groupSearchFilter = groupSearchFilter;
	}
}

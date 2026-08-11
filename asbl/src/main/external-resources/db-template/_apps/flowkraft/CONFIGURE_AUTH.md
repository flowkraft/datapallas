# Authentication & External User Stores

DataPallas Server manages its own users out of the box. This document is about the other option:
pointing it at the directory or identity provider your organisation already runs, so that people sign
in with the account they already have and you stop maintaining a second list.

Everything here is **configuration**. There is no separate build, no plugin to install and no rebuild
of DataPallas Server — you add properties to one file and restart.

---

## 1. Who authenticates, and who deliberately does not

| Component | Authentication |
| --- | --- |
| **DataPallas Desktop** (`DataPallas.exe`) | **None, by design.** One person, one machine, one installation directory. The local caller is authenticated automatically, no login screen is ever shown, and no user administration appears anywhere in the UI. Nothing in this document applies. |
| **DataPallas Server** | **Enforced.** Every API call needs a session, an API token or an embed token. This is what the rest of this document configures. |
| **AI Hub — `_ai-hub/ui-startpage`** | **Inherited from DataPallas Server.** Nothing to configure; see [§7](#7-the-ai-hub-needs-no-configuration-of-its-own). |
| **`grails-playground`, `next-playground`** | **Intentionally unauthenticated.** They are demonstrations of embedding, and a login wall in front of a demo is friction with no payoff. See [§8](#8-why-the-demo-portals-stay-open). |
| **`xx-custom` apps** | **Their own.** A custom app brings whatever authentication its owner built. DataPallas does not impose one. |

---

## 2. The default: users live in SQLite

A freshly downloaded DataPallas Server keeps its users in `config/_internal/iam.db` and needs no
external system at all. On first start it creates one administrator and says so, loudly:

```
*******************************************************************
Created the default administrator:  burst / burst
CHANGE THIS PASSWORD. Until you do, anyone who can reach this
server can sign in as an administrator.
*******************************************************************
```

The login screen repeats those credentials in plain sight — which is the point. A warning asking
people to change a password is easy to postpone; a login page that tells every visitor how to sign in
as an administrator is not. The notice disappears on its own once the password changes, because the
server derives it from the password rather than from a flag someone has to remember to clear.

Manage users, tenants and roles under **Configuration → Users & Tenants**.

**You do not have to read any further.** The rest of this document is only for organisations that want
their existing directory to be the source of truth.

---

## 3. What is supported

| User store | Status | Use when |
| --- | --- | --- |
| **Local SQLite** | Built in, the default | You want DataPallas to be self-contained |
| **LDAP** — OpenLDAP, lldap, 389 Directory, ApacheDS | Supported | You run a directory and want DataPallas to bind against it |
| **Active Directory** | Supported | Windows domain; users sign in with their domain account |
| **OIDC / OAuth 2.0** — Keycloak, Microsoft Entra ID, Okta, Auth0, Google Workspace, Authentik, Zitadel, ADFS 2016+ | Supported | You already have SSO and want one sign-in for everything |

Not supported today, and why:

- **SAML 2.0** — needs OpenSAML, which Maven Central stopped mirroring at 4.0.1, so it costs either a
  third-party Maven repository or a dozen vendored jars in every build. Almost every product on the
  SAML list also speaks OIDC (ADFS has since 2016, as have Okta and Ping), so use the OIDC path. If
  you have a genuinely SAML-only identity provider, say so and it can be added — the code seam for it
  already exists.
- **SCIM** — automatic provisioning and de-provisioning of joiners and leavers. Different problem from
  authentication; DataPallas creates the local record on first sign-in instead.
- **Kerberos / SPNEGO** — desktop single sign-on with no password prompt. Materially harder (keytabs,
  SPNs), and `spring-security-kerberos` is no longer actively maintained.

---

## 4. Five rules that apply to every external store

These are worth understanding before configuring anything, because they explain behaviour that would
otherwise look like a bug.

**1. The local store is never replaced, only added to.** DataPallas always tries local accounts
**first**, then the external one. Two reasons, both learned the hard way by other products: an
unreachable or mistyped directory would otherwise lock every administrator out with no way back in,
and local logins would otherwise sit waiting on a network timeout every time the directory is slow. A
local account is your break-glass path — keep one.

**2. Authentication is external; authorisation stays local.** A directory can answer "is this person
who they say they are". It cannot answer "are they an AUTHOR in the Finance tenant", because tenants
and roles are DataPallas concepts no LDAP schema or ID token holds. So on first sign-in DataPallas
creates a local record to carry the membership. That record has **no password** — it exists to hold a
role, and a password on it would be a second way in that bypasses your identity provider entirely.

**3. Group mapping is re-applied on every sign-in.** Remove someone from the admins group in your
directory and they are downgraded here on their next login, with nobody mirroring the change by hand.
A role set manually in DataPallas survives only while no configured group matches.

**4. The strongest matching group wins.** Someone in both an admins group and a viewers group is an
administrator. Taking whichever the provider happened to list first would make their access depend on
result ordering.

**5. Failures are safe, not permissive.** A group cannot grant `PLATFORM_ADMIN`. An unrecognised role
name in your configuration falls back to `VIEWER`. `default-role` is `VIEWER`, because a directory may
hold thousands of accounts and the safe reading of "this person works here" is "they may look at
reports", not "they may author Groovy".

---

## 5. Where configuration goes

Create or edit:

```
<DataPallas install>/config/application.properties
```

Spring Boot reads that file automatically at startup. Restart the server after any change
(`shutServer.bat` then `startServer.bat`, or restart the Windows service).

> **Secrets.** Client secrets and directory bind passwords sit in this file in plain text. Restrict it
> to the account the server runs as. To keep it out of the file entirely, set the value from an
> environment variable instead — for example `client-secret=${DP_OIDC_SECRET}`.

---

## 6. Configuring each store

### 6.1 LDAP — OpenLDAP, lldap, 389 Directory, ApacheDS

```properties
datapallas.ldap.enabled=true
datapallas.ldap.url=ldap://ldap.corp.local:389
datapallas.ldap.base-dn=dc=corp,dc=local

# How to locate the account. Use ONE of the following.
# A fixed DN pattern, when everyone lives in one branch:
datapallas.ldap.user-dn-patterns=uid={0},ou=people
# ...or a search, when they do not:
#datapallas.ldap.user-search-base=ou=people
#datapallas.ldap.user-search-filter=(uid={0})
# A search needs an account that may read the directory:
#datapallas.ldap.manager-dn=cn=readonly,dc=corp,dc=local
#datapallas.ldap.manager-password=...

# Groups. Omit group-role-map entirely and DataPallas skips the group lookup altogether —
# it would otherwise be a directory round-trip per login whose result nothing reads.
datapallas.ldap.group-search-base=ou=groups
datapallas.ldap.group-search-filter=(member={0})
datapallas.ldap.group-role-map.DataPallas-Admins=TENANT_ADMIN
datapallas.ldap.group-role-map.DataPallas-Authors=AUTHOR
datapallas.ldap.group-role-map.DataPallas-Operators=OPERATOR

datapallas.ldap.default-role=VIEWER
datapallas.ldap.default-tenant=default
```

**lldap** is the easiest of these to stand up and a good way to test the whole path before pointing at
a production directory. Its defaults match the `user-dn-patterns` example above.

### 6.2 Active Directory

Setting `domain` switches to the Active Directory provider, which accepts `user@domain` and locates
the account itself — no DN patterns or search filters to get wrong.

```properties
datapallas.ldap.enabled=true
datapallas.ldap.url=ldap://dc01.corp.local:389
datapallas.ldap.domain=corp.local
datapallas.ldap.base-dn=dc=corp,dc=local

datapallas.ldap.group-role-map.DataPallas-Admins=TENANT_ADMIN
datapallas.ldap.group-role-map.DataPallas-Authors=AUTHOR
datapallas.ldap.default-role=VIEWER
```

Use `ldaps://…:636` in production. AD sub-status codes (expired password, locked account) are
deliberately not surfaced to the caller — every failure reads as "invalid credentials" so that a
failed login tells an attacker nothing.

### 6.3 OIDC / OAuth 2.0 — the generic shape

Two blocks. The first is Spring Boot's standard OAuth2 client configuration, so **every vendor guide
on the internet already tells you what to put there**. The second is the part no vendor guide can
cover: which claim carries the groups, and what those groups mean in DataPallas.

```properties
# --- the identity provider (standard Spring Boot property names) -----------------
spring.security.oauth2.client.registration.myidp.client-id=datapallas
spring.security.oauth2.client.registration.myidp.client-secret=...
spring.security.oauth2.client.registration.myidp.client-name=Acme SSO
spring.security.oauth2.client.registration.myidp.scope=openid,profile,email,groups
spring.security.oauth2.client.registration.myidp.authorization-grant-type=authorization_code
spring.security.oauth2.client.registration.myidp.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}

# Discovery: one line, if the provider publishes /.well-known/openid-configuration
spring.security.oauth2.client.provider.myidp.issuer-uri=https://idp.example.com/realms/acme
spring.security.oauth2.client.provider.myidp.user-name-attribute=preferred_username

# --- what those identities mean here --------------------------------------------
datapallas.oidc.group-role-map.DataPallas-Admins=TENANT_ADMIN
datapallas.oidc.group-role-map.DataPallas-Authors=AUTHOR
datapallas.oidc.default-role=VIEWER
datapallas.oidc.default-tenant=default
#datapallas.oidc.display-name=Sign in with Acme      # button label; defaults to client-name
#datapallas.oidc.username-claims=preferred_username,email,sub
#datapallas.oidc.groups-claims=groups,roles
```

`myidp` is a name you choose. It appears in the callback URL, so whatever you pick here must match
what you register at the provider:

```
Redirect / callback URL:   https://<your-datapallas-host>:9090/login/oauth2/code/myidp
```

A **"Sign in with …"** button appears on the DataPallas login page as soon as a registration exists.
The list is read from the registrations themselves, so a button can never appear for a provider that
would fail on click. The username and password form stays — that is rule 1.

**Groups are the part that usually needs attention.** Most providers do not emit a `groups` claim
until you tell them to, and each calls it something different. DataPallas tries `groups` then `roles`
by default, reads both if both are present, and copes with the shapes providers actually send: a JSON
array, a single string, a comma-separated string, or Entra ID's objects-with-`displayName`. If nobody
is getting the right role, the group claim is almost always the reason — see [§9](#9-troubleshooting).

### 6.4 Keycloak

The most straightforward option if you do not already have an identity provider, and the one to use
when you want something that just works.

**In Keycloak:**

1. Create a realm, e.g. `datapallas`.
2. **Clients → Create client** — client ID `datapallas`, client authentication **On** (confidential),
   standard flow enabled.
3. **Valid redirect URIs**: `https://<your-datapallas-host>:9090/login/oauth2/code/keycloak`
4. Copy the secret from **Credentials**.
5. **Client scopes → datapallas-dedicated → Add mapper → By configuration → Group Membership**.
   Set **Token Claim Name** to `groups`, and turn **Full group path** *off* — otherwise groups arrive
   as `/DataPallas-Admins` and will not match your map.
6. Create the groups (`DataPallas-Admins`, `DataPallas-Authors`, …) and put people in them.

**In DataPallas:**

```properties
spring.security.oauth2.client.registration.keycloak.client-id=datapallas
spring.security.oauth2.client.registration.keycloak.client-secret=<from Credentials>
spring.security.oauth2.client.registration.keycloak.client-name=Keycloak
spring.security.oauth2.client.registration.keycloak.scope=openid,profile,email,groups
spring.security.oauth2.client.registration.keycloak.authorization-grant-type=authorization_code
spring.security.oauth2.client.registration.keycloak.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}

spring.security.oauth2.client.provider.keycloak.issuer-uri=http://keycloak.corp.local:8480/realms/datapallas
spring.security.oauth2.client.provider.keycloak.user-name-attribute=preferred_username

datapallas.oidc.group-role-map.DataPallas-Admins=TENANT_ADMIN
datapallas.oidc.group-role-map.DataPallas-Authors=AUTHOR
datapallas.oidc.default-role=VIEWER
```

> `issuer-uri` is fetched at startup. If Keycloak is not reachable when DataPallas starts, startup
> fails. Where that matters, list the endpoints explicitly (`authorization-uri`, `token-uri`,
> `user-info-uri`, `jwk-set-uri`) instead of using discovery.

### 6.5 Microsoft Entra ID (Azure AD)

```properties
spring.security.oauth2.client.registration.entra.client-id=<application (client) ID>
spring.security.oauth2.client.registration.entra.client-secret=<client secret>
spring.security.oauth2.client.registration.entra.client-name=Microsoft
spring.security.oauth2.client.registration.entra.scope=openid,profile,email
spring.security.oauth2.client.registration.entra.authorization-grant-type=authorization_code
spring.security.oauth2.client.registration.entra.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}

spring.security.oauth2.client.provider.entra.issuer-uri=https://login.microsoftonline.com/<tenant-id>/v2.0
spring.security.oauth2.client.provider.entra.user-name-attribute=preferred_username

datapallas.oidc.group-role-map.DataPallas-Admins=TENANT_ADMIN
datapallas.oidc.default-role=VIEWER
```

In the app registration, **Token configuration → Add groups claim**. Choose **Groups assigned to the
application** to keep the token small. By default Entra emits group **object IDs**, not names, so
either select "Group ID" and map the GUIDs:

```properties
datapallas.oidc.group-role-map.8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f=TENANT_ADMIN
```

…or use **App roles** instead of groups, which are emitted by name in a `roles` claim that DataPallas
already reads.

### 6.6 Okta, Auth0, Google Workspace, Authentik, Zitadel

All follow §6.3 unchanged. Create a **Web / Regular Web Application**, set the redirect URI to
`https://<host>:9090/login/oauth2/code/<your-registration-name>`, and set `issuer-uri` to the value the
provider gives you.

- **Okta** — add a "Groups" claim to the ID token (Security → API → Authorization Servers → Claims),
  filter it to the groups you care about.
- **Auth0** — Auth0 does not emit groups by default; add them with a Login Action that sets a custom
  claim, then point `datapallas.oidc.groups-claims` at whatever you named it.
- **Google Workspace** — Google does not emit group membership in the ID token at all. Use it for
  authentication only and assign roles in DataPallas, or put Keycloak in front.

### 6.7 Supabase

Supabase Auth can act as an OIDC provider — its OAuth 2.1 / OIDC server mode exposes a
`/.well-known/openid-configuration` document, which is all DataPallas needs. Configure it exactly as
in §6.3, with `issuer-uri` pointing at your Supabase auth URL.

Two things to know before choosing this route:

1. **You have to supply the authorization and consent page yourself.** Supabase's OAuth server mode
   expects your application to host the endpoint that receives the authorization request, signs the
   user in and asks them to approve. That is application work, not configuration.
2. **Enable server mode explicitly.** On the self-hosted stack in `db/supabase/docker-compose.yml`
   this means `GOTRUE_OAUTH_SERVER_ENABLED=true` plus
   `GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH` pointing at the page from (1). Support on hosted Supabase
   projects has known gaps at the time of writing.

If your goal is simply "let people sign in to DataPallas with our accounts", **Keycloak is
considerably less work**. Supabase makes sense here when you are already using it as your product's
identity system and want DataPallas to join that, rather than the other way round.

---

## 7. The AI Hub needs no configuration of its own

`_ai-hub/ui-startpage` has no login screen, no user list and no identity provider settings. It asks
DataPallas Server who the caller is:

- Cookies are scoped by **host, not port**, so the session cookie DataPallas sets on `:9090` is sent to
  the AI Hub on `:8440` too.
- Its middleware forwards that cookie to `/api/auth/me`. A `200` means a real signed-in user and the
  page opens; a `401` sends the browser to the DataPallas login.
- Its data calls are proxied through `/api/dp`, which forwards the caller's own session — so the
  backend authorises every one of them as that user. The proxy holds no credential of its own.

**Consequence:** whatever you configure in §6 governs the AI Hub automatically. Turn on Entra ID and
AI Hub users sign in with Entra ID, without a second registration, a second redirect URI or a shared
secret. On Desktop the backend authenticates the local caller, `/auth/me` answers `200`, and the AI Hub
opens with no login at all — same code, no flag.

The only setting is where the backend lives, which is already set by the installer:

```
DP_API_URL=http://host.docker.internal:9090/api
```

---

## 8. Why the demo portals stay open

`grails-playground` and `next-playground` are demonstrations of **embedding** — showing a DataPallas
dashboard or table inside somebody else's web application. They are deliberately left unauthenticated:
a login wall in front of a demo adds friction and demonstrates nothing.

That does not make the data open. The pages themselves are public; the DataPallas **data** behind the
embedded components is not. Each portal's *server* holds the DataPallas API key (read from
`config/_internal/api-key.txt`, never sent to the browser) and uses it to mint a short-lived embed
token per page render. The browser only ever receives a token that unlocks one report for about an
hour.

So: visitors need no account, the API key never reaches a browser, and nothing in this document needs
to be configured for these apps. If you want a portal that *does* authenticate its visitors, that is an
`xx-custom` app with its own authentication — see the billing-portal example.

---

## 9. Verifying and troubleshooting

After a restart, check in this order.

```bash
# 1. Which sign-in buttons the server is offering. [] means no provider was picked up.
curl http://localhost:9090/api/auth/providers

# 2. Does the redirect to your identity provider work? Expect 302 and a Location header.
curl -i http://localhost:9090/oauth2/authorization/<your-registration-name>

# 3. Is the local break-glass account still there? Expect usingDefaultCredentials to be false
#    once you have changed the password.
curl http://localhost:9090/api/auth/first-run
```

The startup log states plainly what was activated:

```
OIDC login enabled
Federated sign-in available: [keycloak]
LDAP authentication enabled against ldap://dc01.corp.local:389 (Active Directory)
Authentication chain: local store first, then 1 federated provider(s)
```

| Symptom | Cause |
| --- | --- |
| `/api/auth/providers` returns `[]` | No registration was read. Check the file is at `config/application.properties` under the install directory, and that both a `registration.<name>` **and** a `provider.<name>` block exist. |
| No button on the login page | Same as above — the page renders whatever that endpoint returns. |
| Server will not start, complains about the issuer | `issuer-uri` is fetched at startup and the provider was unreachable. Fix connectivity or list the four endpoints explicitly (§6.4). |
| Sign-in works, but everyone lands as `VIEWER` | The groups claim is not arriving, or its names do not match `group-role-map`. Decode the ID token at jwt.io and look at what the claim is actually called and what is in it. Keycloak: turn **Full group path** off. Entra: you are probably getting GUIDs. |
| Redirected back to the login page with "recognised but has no access" | The user authenticated but got no role at all — usually a missing `default-tenant`, or a tenant code that does not exist. |
| Bounced back with "did not complete" | The provider rejected the exchange. Nearly always a redirect-URI mismatch: it must be exactly `<baseUrl>/login/oauth2/code/<registration-name>`. |
| A REST client gets `401` on `POST /api/auth/login` | Missing CSRF token. Browsers handle this automatically. Machine callers should use `X-API-Key` instead, which is exempt. |
| Locked out entirely | Delete or rename `config/application.properties` and restart. Authentication falls back to the local SQLite store, which is exactly why rule 1 exists. |

---

## 10. Turning it off

Remove (or comment out) the `datapallas.ldap.*` / `spring.security.oauth2.client.*` blocks and
restart. Local accounts keep working throughout — they were never switched off. Records created for
federated users remain in `iam.db`; they carry no password, so nobody can sign in as them once the
provider is gone. Delete them under **Configuration → Users & Tenants** if you want them gone.

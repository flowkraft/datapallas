package com.flowkraft

import java.security.MessageDigest

/**
 * Tiny dependency-free auth: SHA-256(salt + password) hex hashing + credential check.
 * Deliberately not the Spring Security plugin — this is a minimal demo portal, session-based.
 */
class AuthService {

    static final String SALT = 'bp-demo-salt-v1'

    String hash(String raw) {
        MessageDigest md = MessageDigest.getInstance('SHA-256')
        byte[] digest = md.digest((SALT + (raw ?: '')).getBytes('UTF-8'))
        digest.encodeHex().toString()
    }

    boolean verify(String raw, String storedHash) {
        storedHash && storedHash == hash(raw)
    }

    /** Return the AppUser if the credentials are valid, else null. */
    AppUser authenticate(String username, String password) {
        AppUser u = username ? AppUser.findByUsername(username) : null
        (u && verify(password, u.passwordHash)) ? u : null
    }
}

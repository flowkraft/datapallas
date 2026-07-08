/**
 * Matrix Provisioner Helper Functions
 * 
 * Provides programmatic access to Matrix/Synapse operations:
 * - Create admin users (Synapse Admin API)
 * - Create rooms (Matrix Client-Server API)
 * - Invite bots to rooms
 * - Send messages/commands to rooms
 * 
 * These functions use direct REST API calls for maximum control.
 * The matrix-js-sdk is available if more complex operations are needed.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface MatrixConfig {
  /** Synapse server URL (e.g., http://localhost:8008 or http://flowkraft-ai-hub-matrix-synapse:8008) */
  homeserverUrl: string;
  /** Server name/domain (e.g., localhost or flowkraft.local) */
  serverName: string;
  /** Admin access token (from Synapse config or login) */
  adminAccessToken?: string;
  /** Shared registration secret (from homeserver.yaml) - for creating users without admin token */
  registrationSharedSecret?: string;
}

// Default config - can be overridden
let config: MatrixConfig = {
  homeserverUrl: process.env.MATRIX_HOMESERVER_URL || 'http://flowkraft-ai-hub-matrix-synapse:8008',
  serverName: process.env.MATRIX_SERVER_NAME || 'localhost',
  adminAccessToken: process.env.MATRIX_ADMIN_TOKEN,
  registrationSharedSecret: process.env.MATRIX_REGISTRATION_SECRET,
};

/**
 * Initialize/update the Matrix configuration
 */
export function initMatrixConfig(newConfig: Partial<MatrixConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get the current Matrix configuration
 */
export function getMatrixConfig(): MatrixConfig {
  return { ...config };
}

// ============================================================================
// Helper Types
// ============================================================================

export interface MatrixUser {
  userId: string;
  displayName?: string;
  admin?: boolean;
}

export interface MatrixRoom {
  roomId: string;
  roomAlias?: string;
  name: string;
}

export interface MatrixApiError {
  errcode: string;
  error: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build a full Matrix user ID from a username
 * @example buildUserId('kraftbot') => '@kraftbot:localhost'
 */
function buildUserId(username: string): string {
  if (username.startsWith('@')) {
    return username; // Already a full user ID
  }
  return `@${username}:${config.serverName}`;
}

/**
 * Build a room alias from a name
 * @example buildRoomAlias('athena') => '#athena:localhost'
 */
function buildRoomAlias(aliasName: string): string {
  if (aliasName.startsWith('#')) {
    return aliasName; // Already a full alias
  }
  return `#${aliasName}:${config.serverName}`;
}

/**
 * Make an authenticated request to the Matrix API.
 * Automatically retries on rate limiting (429 / M_LIMIT_EXCEEDED) with backoff.
 */
async function matrixFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const url = `${config.homeserverUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (config.adminAccessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${config.adminAccessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (response.ok) {
      return data as T;
    }

    // Rate limited — retry with capped backoff (Synapse can return absurd retry_after_ms values like 300s+)
    const apiError = data as MatrixApiError & { retry_after_ms?: number };
    if (response.status === 429 && attempt < maxRetries) {
      const MAX_RETRY_DELAY_MS = 5000;
      const retryAfterMs = Math.min(apiError.retry_after_ms || 2000, MAX_RETRY_DELAY_MS);
      const backoff = retryAfterMs + 500 * (attempt + 1);
      console.warn(`[Matrix] Rate limited on ${endpoint}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(backoff);
      continue;
    }

    throw new Error(`Matrix API Error [${apiError.errcode}]: ${apiError.error}`);
  }

  throw new Error(`Max retries (${maxRetries}) exceeded for ${endpoint}`);
}

// ============================================================================
// Registration with Shared Secret (Bootstrap without existing admin)
// ============================================================================

/**
 * Register a new user using Synapse's registration_shared_secret.
 * This allows creating users (including admins) on a fresh installation
 * without needing any pre-existing authentication.
 * 
 * The registration_shared_secret must be set in homeserver.yaml.
 * 
 * @param options - User registration options
 * @returns Registration result with user_id and access_token
 * 
 * @example
 * const result = await registerUserWithSharedSecret({
 *   username: 'admin',
 *   password: 'secure_password',
 *   admin: true
 * });
 * initMatrixConfig({ adminAccessToken: result.accessToken });
 */
export async function registerUserWithSharedSecret(options: {
  username: string;
  password: string;
  displayName?: string;
  admin?: boolean;
}): Promise<{
  success: boolean;
  userId: string;
  accessToken: string;
  deviceId: string;
  message: string;
}> {
  const sharedSecret = config.registrationSharedSecret;
  
  if (!sharedSecret) {
    throw new Error('registration_shared_secret not configured. Set MATRIX_REGISTRATION_SECRET env var or call initMatrixConfig()');
  }

  console.log(`[Matrix] Registering user with shared secret: ${options.username}`);

  // Step 1: Get a nonce from the server
  const nonceResponse = await fetch(`${config.homeserverUrl}/_synapse/admin/v1/register`, {
    method: 'GET',
  });
  
  if (!nonceResponse.ok) {
    throw new Error(`Failed to get registration nonce: ${await nonceResponse.text()}`);
  }
  
  const { nonce } = await nonceResponse.json() as { nonce: string };
  console.log(`[Matrix] Got registration nonce`);

  // Step 2: Generate HMAC-SHA1 MAC
  // The MAC is: HMAC-SHA1(nonce + "\x00" + username + "\x00" + password + "\x00" + admin_flag, shared_secret)
  const adminFlag = options.admin ? 'admin' : 'notadmin';
  const macData = `${nonce}\x00${options.username}\x00${options.password}\x00${adminFlag}`;
  
  // Use Node.js crypto for HMAC
  const crypto = await import('crypto');
  const mac = crypto.createHmac('sha1', sharedSecret)
    .update(macData)
    .digest('hex');

  // Step 3: Register the user
  const registerResponse = await fetch(`${config.homeserverUrl}/_synapse/admin/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce,
      username: options.username,
      password: options.password,
      displayname: options.displayName || options.username,
      admin: options.admin ?? false,
      mac,
    }),
  });

  if (!registerResponse.ok) {
    const error = await registerResponse.text();
    // Check if user already exists
    if (error.includes('User ID already taken') || error.includes('M_USER_IN_USE')) {
      console.log(`[Matrix] User already exists, attempting login instead`);
      // Fall back to login
      const loginResult = await loginToMatrix(options.username, options.password);
      return {
        success: true,
        userId: loginResult.userId,
        accessToken: loginResult.accessToken,
        deviceId: loginResult.deviceId,
        message: 'User already existed, logged in instead',
      };
    }
    throw new Error(`Registration failed: ${error}`);
  }

  const result = await registerResponse.json() as {
    user_id: string;
    access_token: string;
    device_id: string;
  };

  console.log(`[Matrix] ✅ User registered: ${result.user_id}`);
  
  return {
    success: true,
    userId: result.user_id,
    accessToken: result.access_token,
    deviceId: result.device_id,
    message: `User ${result.user_id} registered successfully`,
  };
}

/**
 * Bootstrap Matrix access by creating an admin user with the shared secret.
 * This is the recommended way to initialize Matrix on a fresh installation.
 * 
 * @returns The admin access token (also sets it in config)
 */
export async function bootstrapMatrixAdmin(options?: {
  username?: string;
  password?: string;
}): Promise<string> {
  const username = options?.username || 'provisioner-admin';
  const password = options?.password || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  console.log(`[Matrix] Bootstrapping admin user: ${username}`);
  
  const result = await registerUserWithSharedSecret({
    username,
    password,
    displayName: 'Provisioner Admin',
    admin: true,
  });
  
  // Set the token in config for subsequent API calls
  initMatrixConfig({ adminAccessToken: result.accessToken });
  
  console.log(`[Matrix] ✅ Admin bootstrapped, access token configured`);
  
  return result.accessToken;
}

// ============================================================================
// 1. Create Admin User (Synapse Admin API)
// ============================================================================

export interface CreateUserOptions {
  /** Username (without @domain) */
  username: string;
  /** Password for the user */
  password: string;
  /** Display name */
  displayName?: string;
  /** Whether this user should be an admin */
  admin?: boolean;
}

export interface CreateUserResult {
  success: boolean;
  userId: string;
  created: boolean; // false if user already existed
  message: string;
}

/**
 * Create a new user via Synapse Admin API
 * 
 * @param options - User creation options
 * @returns Result with userId and status
 * 
 * @example
 * const result = await createAdminUser({
 *   username: 'kraftbot',
 *   password: 'bot_secret_password',
 *   displayName: 'Kraftbot',
 *   admin: false
 * });
 */
export async function createAdminUser(options: CreateUserOptions): Promise<CreateUserResult> {
  const userId = buildUserId(options.username);
  
  console.log(`[Matrix] Creating user: ${userId}`);

  try {
    // Synapse Admin API: PUT /_synapse/admin/v2/users/{userId}
    // This endpoint creates the user if they don't exist, or updates if they do
    await matrixFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: options.password,
        displayname: options.displayName || options.username,
        admin: options.admin ?? false,
        deactivated: false,
      }),
    });

    console.log(`[Matrix] ✅ User created/updated: ${userId}`);
    return {
      success: true,
      userId,
      created: true,
      message: `User ${userId} created successfully`,
    };
  } catch (error) {
    const err = error as Error;
    
    // Check if user already exists (not an error for our purposes)
    if (err.message.includes('M_USER_IN_USE')) {
      console.log(`[Matrix] ℹ️ User already exists: ${userId}`);
      return {
        success: true,
        userId,
        created: false,
        message: `User ${userId} already exists`,
      };
    }

    console.error(`[Matrix] ❌ Failed to create user: ${err.message}`);
    throw error;
  }
}

// ============================================================================
// 2. Create Room (Matrix Client-Server API)
// ============================================================================

export interface CreateRoomOptions {
  /** Room name (displayed in client) */
  name: string;
  /** Room alias (e.g., 'athena' becomes #athena:localhost) */
  alias?: string;
  /** Room topic/description */
  topic?: string;
  /** Initial users to invite */
  invite?: string[];
  /** Whether the room should be public */
  isPublic?: boolean;
}

export interface CreateRoomResult {
  success: boolean;
  roomId: string;
  roomAlias?: string;
  created: boolean;
  message: string;
}

/**
 * Create a new Matrix room
 * 
 * @param options - Room creation options
 * @returns Result with roomId and status
 * 
 * @example
 * const result = await createRoom({
 *   name: 'Oracle: Athena',
 *   alias: 'athena',
 *   topic: 'Chat with Athena - Data & Analytics Oracle',
 *   invite: ['@kraftbot:localhost']
 * });
 */
export async function createRoom(options: CreateRoomOptions): Promise<CreateRoomResult> {
  const roomAlias = options.alias ? buildRoomAlias(options.alias) : undefined;
  
  console.log(`[Matrix] Creating room: ${options.name}${roomAlias ? ` (${roomAlias})` : ''}`);

  try {
    // Matrix Client-Server API: POST /_matrix/client/v3/createRoom
    const response = await matrixFetch<{ room_id: string; room_alias?: string }>(
      '/_matrix/client/v3/createRoom',
      {
        method: 'POST',
        body: JSON.stringify({
          name: options.name,
          room_alias_name: options.alias, // Just the local part, without # or :domain
          topic: options.topic,
          invite: options.invite?.map(u => buildUserId(u)),
          preset: options.isPublic ? 'public_chat' : 'private_chat',
          visibility: options.isPublic ? 'public' : 'private',
        }),
      }
    );

    console.log(`[Matrix] ✅ Room created: ${response.room_id}`);
    return {
      success: true,
      roomId: response.room_id,
      roomAlias: roomAlias,
      created: true,
      message: `Room "${options.name}" created successfully`,
    };
  } catch (error) {
    const err = error as Error;
    
    // Check if room alias already exists
    if (err.message.includes('M_ROOM_IN_USE')) {
      console.log(`[Matrix] ℹ️ Room alias already exists: ${roomAlias}`);
      
      // Try to resolve the existing room ID from the alias
      try {
        const aliasResponse = await matrixFetch<{ room_id: string }>(
          `/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias!)}`
        );
        return {
          success: true,
          roomId: aliasResponse.room_id,
          roomAlias: roomAlias,
          created: false,
          message: `Room ${roomAlias} already exists`,
        };
      } catch {
        // Couldn't resolve alias, return partial success
        return {
          success: true,
          roomId: '',
          roomAlias: roomAlias,
          created: false,
          message: `Room alias ${roomAlias} exists but couldn't resolve room ID`,
        };
      }
    }

    console.error(`[Matrix] ❌ Failed to create room: ${err.message}`);
    throw error;
  }
}

// ============================================================================
// 3. Invite Bot to Room (Matrix Client-Server API)
// ============================================================================

export interface InviteResult {
  success: boolean;
  roomId: string;
  userId: string;
  message: string;
}

/**
 * Invite a user (bot) to a room
 * 
 * @param botName - Username of the bot (e.g., 'kraftbot')
 * @param roomIdOrAlias - Room ID (e.g., '!abc:localhost') or alias (e.g., '#athena:localhost' or 'athena')
 * @returns Result with status
 * 
 * @example
 * await inviteBotToRoom('kraftbot', '!roomId:localhost');
 * // or
 * await inviteBotToRoom('kraftbot', 'athena');
 */
export async function inviteBotToRoom(
  botName: string,
  roomIdOrAlias: string
): Promise<InviteResult> {
  const userId = buildUserId(botName);
  
  // Resolve room ID if given an alias
  let roomId = roomIdOrAlias;
  if (!roomIdOrAlias.startsWith('!')) {
    const alias = buildRoomAlias(roomIdOrAlias);
    console.log(`[Matrix] Resolving room alias: ${alias}`);
    const aliasResponse = await matrixFetch<{ room_id: string }>(
      `/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`
    );
    roomId = aliasResponse.room_id;
  }

  console.log(`[Matrix] Inviting ${userId} to room ${roomId}`);

  try {
    // Matrix Client-Server API: POST /_matrix/client/v3/rooms/{roomId}/invite
    await matrixFetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
      }),
    });

    console.log(`[Matrix] ✅ Invited ${userId} to ${roomId}`);
    return {
      success: true,
      roomId,
      userId,
      message: `Successfully invited ${userId} to room`,
    };
  } catch (error) {
    const err = error as Error;
    
    // User might already be in the room
    if (err.message.includes('M_FORBIDDEN') && err.message.includes('already in the room')) {
      console.log(`[Matrix] ℹ️ User ${userId} already in room ${roomId}`);
      return {
        success: true,
        roomId,
        userId,
        message: `User ${userId} is already in the room`,
      };
    }

    console.error(`[Matrix] ❌ Failed to invite: ${err.message}`);
    throw error;
  }
}

// ============================================================================
// 4. Send Message/Command to Room (Matrix Client-Server API)
// ============================================================================

export interface SendMessageResult {
  success: boolean;
  roomId: string;
  eventId: string;
  message: string;
}

/**
 * Send a text message or command to a room
 * 
 * @param message - The message text or command (e.g., '!baibot access set-handler @kraftbot athena')
 * @param roomIdOrAlias - Room ID or alias
 * @returns Result with eventId
 * 
 * @example
 * await sendCommandMessageToRoom(
 *   '!baibot access set-handler @kraftbot:localhost athena',
 *   'athena'
 * );
 */
export async function sendCommandMessageToRoom(
  message: string,
  roomIdOrAlias: string
): Promise<SendMessageResult> {
  // Resolve room ID if given an alias
  let roomId = roomIdOrAlias;
  if (!roomIdOrAlias.startsWith('!')) {
    const alias = buildRoomAlias(roomIdOrAlias);
    console.log(`[Matrix] Resolving room alias: ${alias}`);
    const aliasResponse = await matrixFetch<{ room_id: string }>(
      `/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`
    );
    roomId = aliasResponse.room_id;
  }

  // Generate a unique transaction ID
  const txnId = `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  console.log(`[Matrix] Sending message to ${roomId}: "${message.substring(0, 50)}..."`);

  try {
    // Matrix Client-Server API: PUT /_matrix/client/v3/rooms/{roomId}/send/{eventType}/{txnId}
    const response = await matrixFetch<{ event_id: string }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message,
        }),
      }
    );

    console.log(`[Matrix] ✅ Message sent, event ID: ${response.event_id}`);
    return {
      success: true,
      roomId,
      eventId: response.event_id,
      message: 'Message sent successfully',
    };
  } catch (error) {
    const err = error as Error;
    console.error(`[Matrix] ❌ Failed to send message: ${err.message}`);
    throw error;
  }
}

// ============================================================================
// Utility: Login and get access token
// ============================================================================

export interface LoginResult {
  success: boolean;
  userId: string;
  accessToken: string;
  deviceId: string;
}

/**
 * Login to Matrix and get an access token
 * 
 * @param username - Username (without @domain)
 * @param password - Password
 * @returns Login result with access token
 * 
 * @example
 * const { accessToken } = await loginToMatrix('admin', 'admin_password');
 * initMatrixConfig({ adminAccessToken: accessToken });
 */
export async function loginToMatrix(
  username: string,
  password: string
): Promise<LoginResult> {
  const userId = buildUserId(username);
  
  console.log(`[Matrix] Logging in as: ${userId}`);

  const response = await matrixFetch<{
    user_id: string;
    access_token: string;
    device_id: string;
  }>('/_matrix/client/v3/login', {
    method: 'POST',
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: username,
      },
      password,
      initial_device_display_name: 'AI Hub Provisioner',
    }),
  });

  console.log(`[Matrix] ✅ Logged in as ${response.user_id}`);
  return {
    success: true,
    userId: response.user_id,
    accessToken: response.access_token,
    deviceId: response.device_id,
  };
}

// ============================================================================
// Utility: Check if user exists
// ============================================================================

/**
 * Check if a user exists in the Matrix server
 */
export async function userExists(username: string): Promise<boolean> {
  const userId = buildUserId(username);
  
  try {
    await matrixFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Utility: Check if room exists
// ============================================================================

/**
 * Check if a room exists by alias
 */
export async function roomExists(alias: string): Promise<boolean> {
  const fullAlias = buildRoomAlias(alias);
  
  try {
    await matrixFetch(`/_matrix/client/v3/directory/room/${encodeURIComponent(fullAlias)}`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Utility: Check if user has joined a room
// ============================================================================

/**
 * Check if a user has joined a specific room.
 * Uses the joined_members endpoint which returns only users with 'join' membership.
 */
async function isUserInRoom(username: string, roomId: string): Promise<boolean> {
  const userId = buildUserId(username);

  try {
    const resp = await matrixFetch<{ joined: Record<string, unknown> }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`
    );
    return userId in (resp.joined || {});
  } catch {
    return false;
  }
}

// ============================================================================
// ORCHESTRATION: Provision All Matrix Resources
// ============================================================================

/**
 * Oracle room definitions - maps agent keys to room configuration
 */
export const ORACLE_ROOMS = [
  {
    agentKey: 'athena',
    name: 'Athena (DataPallas Guru & Data Modeling/Business Analysis Expert)',
    alias: 'athena',
    topic: 'Chat with Athena - DataPallas Guru & Data Modeling/Business Analysis Expert',
    staticHandler: 'static/athena',
  },
  {
    agentKey: 'hephaestus',
    name: 'Hephaestus (Backend Jobs/ETL/Automation Advisor)',
    alias: 'hephaestus',
    topic: 'Chat with Hephaestus - Backend Jobs/ETL/Automation Advisor',
    staticHandler: 'static/hephaestus',
  },
  {
    agentKey: 'hermes',
    name: 'Hermes (Grails Guru & Self-Service Portal Advisor)',
    alias: 'hermes',
    topic: 'Chat with Hermes - Grails Guru & Self-Service Portal Advisor',
    staticHandler: 'static/hermes',
  },
  {
    agentKey: 'pythia',
    name: 'Pythia (WordPress CMS Portal Advisor)',
    alias: 'pythia',
    topic: 'Chat with Pythia - WordPress CMS Portal Advisor',
    staticHandler: 'static/pythia',
  },
  {
    agentKey: 'apollo',
    name: 'Apollo (Next.js Guru & Modern Web Advisor)',
    alias: 'apollo',
    topic: 'Chat with Apollo - Next.js Guru & Modern Web Advisor',
    staticHandler: 'static/apollo',
  },
  {
    agentKey: 'mnemosyne',
    name: 'Mnemosyne (Data Learning Tutor)',
    alias: 'mnemosyne',
    topic: 'Learn data by doing with Mnemosyne - SQL, data modeling & the DataZeus koans',
    staticHandler: 'static/mnemosyne',
  },
] as const;

// The sentinel room used to check if Matrix is already provisioned
const SENTINEL_ROOM_ALIAS = 'athena';

/**
 * Check if Matrix provisioning has already been completed.
 * We use the existence of the #athena room as a sentinel - if it exists,
 * we assume all rooms were provisioned.
 * 
 * @returns true if Matrix appears to be already provisioned
 */
export async function isMatrixProvisioned(): Promise<boolean> {
  try {
    const exists = await roomExists(SENTINEL_ROOM_ALIAS);
    return exists;
  } catch {
    return false;
  }
}

/**
 * Make a user forget a room (removes it from their room list in clients like Element).
 * Must be called AFTER the user has left the room.
 */
async function forgetRoomForUser(roomId: string, userId: string): Promise<void> {
  try {
    // Use Synapse Admin API to make user forget the room
    // POST /_synapse/admin/v1/users/{user_id}/rooms/{room_id}/forget
    await matrixFetch(
      `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/rooms/${encodeURIComponent(roomId)}/forget`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  } catch {
    // Ignore errors - user may have already forgotten or never joined
  }
}

/**
 * Delete a single room by ID using Synapse Admin API v2 (async delete with polling).
 * Also makes known users forget the room to prevent stale entries in Element.
 * Returns true if successfully deleted/purged, false otherwise.
 */
async function deleteRoomById(roomId: string, label: string): Promise<boolean> {
  try {
    // First, get room members so we can make them forget the room after deletion
    let members: string[] = [];
    try {
      const membersResp = await matrixFetch<{ members: string[] }>(
        `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`
      );
      members = membersResp.members || [];
    } catch {
      // Ignore - we'll still try to delete the room
    }

    const deleteResponse = await matrixFetch<{ delete_id?: string }>(
      `/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ purge: true, force_purge: true, message: 'Room deleted for re-provisioning' }),
      }
    );

    let deleteSuccess = false;

    if (deleteResponse.delete_id) {
      // Poll until purge completes
      for (let i = 0; i < 30; i++) {
        await sleep(1000);
        try {
          const status = await matrixFetch<{ status: string; error?: string }>(
            `/_synapse/admin/v2/rooms/delete_status/${encodeURIComponent(deleteResponse.delete_id)}`
          );
          if (status.status === 'complete') {
            deleteSuccess = true;
            break;
          }
          if (status.status === 'failed') {
            console.error(`   ❌ Purge failed for ${label}: ${status.error || 'unknown'}`);
            return false;
          }
        } catch {
          deleteSuccess = true; // Status endpoint unavailable — assume done
          break;
        }
      }
      if (!deleteSuccess) {
        console.error(`   ❌ Purge timed out for ${label}`);
        return false;
      }
    } else {
      deleteSuccess = true; // No delete_id — sync response, already gone
    }

    // After successful deletion, make all members forget the room
    // This removes stale room entries from Element and other clients
    if (deleteSuccess && members.length > 0) {
      console.log(`      Making ${members.length} user(s) forget room...`);
      for (const userId of members) {
        await forgetRoomForUser(roomId, userId);
      }
    }

    return deleteSuccess;
  } catch (err) {
    console.error(`   ❌ Delete failed for ${label}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * List ALL rooms on the Synapse server using the Admin API.
 * IMPORTANT: This throws on failure - do NOT silently return [] which masks errors!
 */
async function listAllRooms(): Promise<Array<{ room_id: string; name: string; canonical_alias: string }>> {
  const resp = await matrixFetch<{ rooms: Array<{ room_id: string; name: string; canonical_alias: string }>; total_rooms: number }>(
    '/_synapse/admin/v1/rooms?limit=100'
  );
  console.log(`   [listAllRooms] Found ${resp.total_rooms} room(s) on server`);
  return resp.rooms || [];
}

/**
 * Nuclear reset: delete ALL rooms on the Synapse server.
 * Lists every room via Admin API and deletes each one.
 * After deletion, verifies room count is 0 before returning success.
 */
export async function resetMatrixProvisioning(): Promise<{
  success: boolean;
  deletedRooms: string[];
  errors: string[];
}> {
  const result = {
    success: false,
    deletedRooms: [] as string[],
    errors: [] as string[],
  };

  console.log('\n🗑️ Resetting Matrix — deleting ALL rooms...');
  console.log(`   Admin token configured: ${config.adminAccessToken ? 'YES (' + config.adminAccessToken.substring(0, 20) + '...)' : 'NO!'}`);

  // Step 1: List every room on the server
  let allRooms: Array<{ room_id: string; name: string; canonical_alias: string }>;
  try {
    allRooms = await listAllRooms();
    console.log(`   Found ${allRooms.length} room(s) on server`);
  } catch (error) {
    const err = error as Error;
    const msg = `Failed to list rooms (Admin API error): ${err.message}`;
    console.error(`   ❌ ${msg}`);
    result.errors.push(msg);
    return result; // FAIL - don't proceed if we can't list rooms
  }

  if (allRooms.length === 0) {
    console.log('   ✅ No rooms to delete — server is clean');
    result.success = true;
    return result;
  }

  // Step 2: Delete every room
  for (const room of allRooms) {
    const label = room.canonical_alias || room.name || room.room_id;
    console.log(`   🗑️ Deleting ${label} (${room.room_id})...`);
    const ok = await deleteRoomById(room.room_id, label);
    if (ok) {
      result.deletedRooms.push(label);
      console.log(`   ✅ Deleted ${label}`);
    } else {
      result.errors.push(`Failed to delete ${label}`);
    }
  }

  // Step 3: Verify room count is 0
  console.log('   🔍 Verifying all rooms are deleted...');
  const maxVerifyAttempts = 5;
  for (let i = 0; i < maxVerifyAttempts; i++) {
    await sleep(1000);
    try {
      const remaining = await listAllRooms();
      if (remaining.length === 0) {
        console.log('   ✅ Verified: 0 rooms remaining on server');
        result.success = result.errors.length === 0;
        console.log(`\n✅ Reset complete: ${result.deletedRooms.length} rooms deleted`);
        return result;
      }
      console.log(`   ⏳ ${remaining.length} room(s) still remaining, waiting... (${i + 1}/${maxVerifyAttempts})`);
    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ Failed to verify rooms: ${err.message}`);
      result.errors.push(`Failed to verify room deletion: ${err.message}`);
      return result;
    }
  }

  // Rooms still remain after all attempts
  try {
    const finalRemaining = await listAllRooms();
    if (finalRemaining.length > 0) {
      const msg = `${finalRemaining.length} room(s) could not be deleted`;
      result.errors.push(msg);
      console.error(`   ❌ ${msg}`);
    }
  } catch (error) {
    const err = error as Error;
    result.errors.push(`Failed to verify final room count: ${err.message}`);
  }

  result.success = result.errors.length === 0;
  console.log(`\n${result.success ? '✅' : '❌'} Reset complete: ${result.deletedRooms.length} rooms deleted`);
  return result;
}

export interface MatrixProvisionResult {
  success: boolean;
  skipped: boolean;
  adminUser: {
    userId: string;
    username: string;
    password: string;
  };
  rooms: Array<{
    agentKey: string;
    roomId: string;
    roomAlias: string;
    botJoined: boolean;
    handlerSet: boolean;
  }>;
  errors: string[];
}

/**
 * Provision all Matrix resources for FlowKraft AI Hub.
 * 
 * This function orchestrates the complete Matrix setup:
 * 1. Checks if already provisioned (skips if rooms exist, unless force=true)
 * 2. Creates admin user (for API calls and human chat access)
 * 3. Creates oracle rooms (#athena, #hephaestus, #hermes, #apollo)
 * 4. Invites kraftbot to each room
 * 5. Waits for kraftbot to join
 * 6. Sets room handler via !kraft command
 * 
 * After this completes, humans can login to Element with admin/admin
 * and immediately start chatting with the oracles.
 * 
 * @param options - Optional configuration
 * @returns Provisioning result with admin credentials and room info
 */
/**
 * Synapse default rate limits (reference — so we can set smart delays to stay under them):
 *   rc_invites.per_user:  burst=5, then 1 per 333s  ← main bottleneck for 5-room provisioning
 *   rc_invites.per_room:  burst=10, then 1 per 3.3s
 *   rc_joins.local:       burst=10, then 1 per 10s
 *   rc_message:           burst=10, then 1 per 5s
 *
 * Our homeserver.yaml relaxes these for local dev, but the smart delays below
 * keep provisioning safe even on a stock Synapse with default limits.
 */
export async function provisionMatrixRooms(options?: {
  /** Admin username (default: 'admin') */
  adminUsername?: string;
  /** Admin password (default: 'admin') */
  adminPassword?: string;
  /** Kraftbot username (default: 'kraftbot') */
  kraftbotUsername?: string;
  /** Delay in ms to wait for bot to join each check (default: 3000) */
  botJoinDelayMs?: number;
  /** Delay in ms between handler commands (default: 1000) */
  commandDelayMs?: number;
  /** Force re-provisioning: delete existing rooms and start fresh (default: false) */
  force?: boolean;
}): Promise<MatrixProvisionResult> {
  const adminUsername = options?.adminUsername || 'admin';
  const adminPassword = options?.adminPassword || 'admin';
  const kraftbotUsername = options?.kraftbotUsername || 'kraftbot';
  const botJoinDelayMs = options?.botJoinDelayMs || 3000;
  const commandDelayMs = options?.commandDelayMs || 1000;
  const force = options?.force ?? false;

  const result: MatrixProvisionResult = {
    success: false,
    skipped: false,
    adminUser: {
      userId: '',
      username: adminUsername,
      password: adminPassword,
    },
    rooms: [],
    errors: [],
  };

  console.log('\n' + '='.repeat(60));
  console.log('🔮 MATRIX PROVISIONING - FlowKraft AI Hub');
  console.log('='.repeat(60));

  // -------------------------------------------------------------------------
  // Step 0: Create/login admin user (must happen FIRST so sentinel check has auth)
  // -------------------------------------------------------------------------
  console.log('\n📝 Step 0: Creating admin user...');
  try {
    const adminResult = await registerUserWithSharedSecret({
      username: adminUsername,
      password: adminPassword,
      displayName: 'Admin',
      admin: true,
    });

    result.adminUser.userId = adminResult.userId;

    // Set the token for subsequent API calls (needed for sentinel check & everything else)
    initMatrixConfig({ adminAccessToken: adminResult.accessToken });

    console.log(`✅ Admin user ready: ${adminResult.userId}`);
    console.log(`   Login credentials: ${adminUsername} / ${adminPassword}`);
  } catch (error) {
    const err = error as Error;
    result.errors.push(`Failed to create admin user: ${err.message}`);
    console.error(`❌ Failed to create admin user: ${err.message}`);
    return result;
  }

  // -------------------------------------------------------------------------
  // Step 1: Check if already provisioned (now with valid auth token)
  // -------------------------------------------------------------------------
  console.log('\n🔍 Checking if Matrix is already provisioned...');

  const alreadyProvisioned = await isMatrixProvisioned();

  if (alreadyProvisioned) {
    if (force) {
      console.log('⚠️  Force flag set - will reset and re-provision Matrix');

      // Nuclear reset — delete ALL rooms and verify 0 remain
      const resetResult = await resetMatrixProvisioning();
      if (!resetResult.success) {
        result.errors.push('Force reset failed: could not delete all rooms');
        console.error('❌ Force reset failed — cannot proceed with rooms still present');
        return result;
      }
      // Double-check: verify room count is truly 0
      const remaining = await listAllRooms();
      if (remaining.length > 0) {
        result.errors.push(`Force reset incomplete: ${remaining.length} room(s) still present`);
        console.error(`❌ ${remaining.length} room(s) still present after reset — aborting`);
        return result;
      }
      console.log('✅ Server confirmed clean (0 rooms) — proceeding with fresh provisioning');
    } else {
      // force=false and sentinel room exists — skip all provisioning
      console.log('✅ Matrix already provisioned (sentinel room #athena exists) — skipping all');
      result.success = true;
      result.skipped = true;
      return result;
    }
  } else {
    console.log('📝 Matrix not yet provisioned, proceeding with setup...');
  }

  // -------------------------------------------------------------------------
  // Step 1b: Register kraftbot user (so baibot can log in)
  // -------------------------------------------------------------------------
  console.log('\n📝 Step 1b: Registering kraftbot user...');
  try {
    const kraftbotPassword = process.env.KRAFTBOT_PASSWORD || 'kraftbot';
    await registerUserWithSharedSecret({
      username: kraftbotUsername,
      password: kraftbotPassword,
      displayName: kraftbotUsername,
      admin: false,
    });
    console.log(`✅ Kraftbot user ready: @${kraftbotUsername}:${config.serverName}`);
  } catch (error) {
    const err = error as Error;
    result.errors.push(`Failed to register kraftbot user: ${err.message}`);
    console.error(`❌ Failed to register kraftbot user: ${err.message}`);
    console.error(`❌ Without the kraftbot user, the bot cannot log in and rooms will not work.`);
    return result;
  }

  // -------------------------------------------------------------------------
  // Step 2-5: For each oracle room (serial, with smart pacing)
  //
  // Synapse default rc_invites.per_user: burst=5, then 1 per 333s.
  // With 5 rooms we're right at burst limit. Defense layers:
  //   Layer 1: homeserver.yaml relaxes limits to 1000/s (prevents 429 entirely)
  //   Layer 2: 200ms settle after create + natural API call spacing (~700ms/room)
  //   Layer 3: matrixFetch retries 429s with capped 5s backoff (last resort)
  // -------------------------------------------------------------------------
  for (const oracleRoom of ORACLE_ROOMS) {
    console.log(`\n🏛️ Processing room: ${oracleRoom.name}`);

    const roomResult = {
      agentKey: oracleRoom.agentKey,
      roomId: '',
      roomAlias: `#${oracleRoom.alias}:${config.serverName}`,
      botJoined: false,
      handlerSet: false,
    };

    // Step 2: Create room
    console.log(`   📝 Creating room #${oracleRoom.alias}...`);
    try {
      const createResult = await createRoom({
        name: oracleRoom.name,
        alias: oracleRoom.alias,
        topic: oracleRoom.topic,
        isPublic: true,
      });

      roomResult.roomId = createResult.roomId;
      console.log(`   ✅ Room created: ${createResult.roomId}`);
    } catch (error) {
      const err = error as Error;
      result.errors.push(`Failed to create room ${oracleRoom.alias}: ${err.message}`);
      console.error(`   ❌ Failed to create room: ${err.message}`);
      result.rooms.push(roomResult);
      continue;
    }

    // Brief settle — let Synapse finish indexing the new room before invite
    await sleep(200);

    // Step 3: Invite kraftbot
    console.log(`   📨 Inviting @${kraftbotUsername} to room...`);
    try {
      await inviteBotToRoom(kraftbotUsername, roomResult.roomId);
      console.log(`   ✅ Invitation sent`);
    } catch (error) {
      const err = error as Error;
      result.errors.push(`Failed to invite kraftbot to ${oracleRoom.alias}: ${err.message}`);
      console.error(`   ❌ Failed to invite kraftbot: ${err.message}`);
      result.rooms.push(roomResult);
      continue;
    }

    // Step 4: Wait for bot to join, then verify membership. The provisioning flow may have
    // just recreated the baibot container (to re-couple it to a freshly-restarted letta), so
    // kraftbot can still be completing its initial Matrix sync when the first invites go out —
    // give it a generous window (breaks early as soon as the join is verified).
    console.log(`   ⏳ Waiting for bot to join...`);
    const maxJoinChecks = 8;
    const joinCheckIntervalMs = botJoinDelayMs;
    for (let check = 1; check <= maxJoinChecks; check++) {
      await sleep(joinCheckIntervalMs);
      const joined = await isUserInRoom(kraftbotUsername, roomResult.roomId);
      if (joined) {
        roomResult.botJoined = true;
        console.log(`   ✅ Bot joined room (verified on check ${check}/${maxJoinChecks})`);
        break;
      }
      if (check < maxJoinChecks) {
        console.log(`   ⏳ Bot not yet joined, waiting... (check ${check}/${maxJoinChecks})`);
      }
    }

    if (!roomResult.botJoined) {
      const msg = `Kraftbot did not join room ${oracleRoom.alias} after ${maxJoinChecks * joinCheckIntervalMs / 1000}s — is the baibot container running?`;
      result.errors.push(msg);
      console.error(`   ❌ ${msg}`);
      result.rooms.push(roomResult);
      continue;
    }

    // Step 5: Set room handler (only if bot is confirmed in room)
    console.log(`   🔧 Setting handler: ${oracleRoom.staticHandler}...`);
    try {
      const handlerCommand = `!kraft config room set-handler text-generation ${oracleRoom.staticHandler}`;
      await sendCommandMessageToRoom(handlerCommand, roomResult.roomId);
      roomResult.handlerSet = true;
      console.log(`   ✅ Handler command sent`);

      await sleep(commandDelayMs);
    } catch (error) {
      const err = error as Error;
      result.errors.push(`Failed to set handler for ${oracleRoom.alias}: ${err.message}`);
      console.error(`   ❌ Failed to set handler: ${err.message}`);
    }

    result.rooms.push(roomResult);
  }

  // -------------------------------------------------------------------------
  // Retry pass (safety net): retry ONCE any room whose bot didn't join or whose handler wasn't
  // set. By now the whole loop has run so kraftbot is definitely warm — a first-room cold-start
  // miss (or a transient Synapse blip) self-heals here. Errors for fully-recovered rooms are
  // dropped so the run reports SUCCESS.
  // -------------------------------------------------------------------------
  const incomplete = result.rooms.filter(r => r.roomId && (!r.botJoined || !r.handlerSet));
  if (incomplete.length > 0) {
    console.log(`\n🔁 Retrying ${incomplete.length} room(s) that didn't fully provision (kraftbot is warm now)...`);
    for (const roomResult of incomplete) {
      const oracleRoom = ORACLE_ROOMS.find(o => o.agentKey === roomResult.agentKey);
      if (!oracleRoom) continue;
      console.log(`   🔁 Retry #${oracleRoom.alias}...`);

      if (!roomResult.botJoined) {
        try { await inviteBotToRoom(kraftbotUsername, roomResult.roomId); } catch { /* likely already invited */ }
        for (let check = 1; check <= 8; check++) {
          await sleep(botJoinDelayMs);
          if (await isUserInRoom(kraftbotUsername, roomResult.roomId)) { roomResult.botJoined = true; break; }
        }
      }

      if (roomResult.botJoined && !roomResult.handlerSet) {
        try {
          await sendCommandMessageToRoom(
            `!kraft config room set-handler text-generation ${oracleRoom.staticHandler}`,
            roomResult.roomId,
          );
          roomResult.handlerSet = true;
          await sleep(commandDelayMs);
        } catch { /* leave handlerSet false */ }
      }

      console.log(`   ${roomResult.botJoined && roomResult.handlerSet ? '✅ Recovered' : '❌ Still failing'}: #${oracleRoom.alias}`);
    }

    // Drop the earlier errors for rooms the retry fully recovered, so result.success is accurate.
    const recoveredAliases: string[] = [];
    for (const r of incomplete) {
      if (!r.botJoined || !r.handlerSet) continue;
      const alias = ORACLE_ROOMS.find(o => o.agentKey === r.agentKey)?.alias;
      if (alias) recoveredAliases.push(alias);
    }
    if (recoveredAliases.length > 0) {
      result.errors = result.errors.filter(err => !recoveredAliases.some(alias => err.includes(alias)));
    }
  }

  // -------------------------------------------------------------------------
  // Summary — honest reporting
  // -------------------------------------------------------------------------
  const fullyOk = result.rooms.filter(r => r.roomId && r.botJoined && r.handlerSet);
  const roomsCreated = result.rooms.filter(r => r.roomId);
  const botJoined = result.rooms.filter(r => r.botJoined);
  const handlersSet = result.rooms.filter(r => r.handlerSet);

  result.success = fullyOk.length === ORACLE_ROOMS.length && result.errors.length === 0;

  console.log('\n' + '='.repeat(60));
  if (result.success) {
    console.log('🔮 MATRIX PROVISIONING COMPLETE — SUCCESS');
  } else {
    console.log('🔮 MATRIX PROVISIONING COMPLETE — FAILED');
  }
  console.log('='.repeat(60));
  console.log(`   Rooms created:     ${roomsCreated.length}/${ORACLE_ROOMS.length}`);
  console.log(`   Bot joined:        ${botJoined.length}/${ORACLE_ROOMS.length}`);
  console.log(`   Handlers set:      ${handlersSet.length}/${ORACLE_ROOMS.length}`);
  console.log(`   Fully operational: ${fullyOk.length}/${ORACLE_ROOMS.length}`);
  console.log(`📝 Admin login: ${adminUsername} / ${adminPassword}`);
  if (result.errors.length > 0) {
    console.log(`\n❌ ERRORS (${result.errors.length}):`);
    result.errors.forEach(e => console.error(`   - ${e}`));
  }
  if (result.success) {
    console.log('\n🌐 Open Element at http://localhost:8441 to chat with your oracles!');
  }
  console.log('='.repeat(60) + '\n');

  return result;
}

/**
 * Simple sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Default export
// ============================================================================

export default provisionMatrixRooms;

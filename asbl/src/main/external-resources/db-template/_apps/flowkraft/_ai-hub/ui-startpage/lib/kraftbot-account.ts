/**
 * The kraftbot account, made when the AI Hub starts (instrumentation.ts).
 *
 * Same call as Provision's step 1b, registerUserWithSharedSecret: registration stays closed, the
 * shared secret is the installation's own config/_internal/api-key.txt, and an account that is
 * already there is logged in rather than made again. Synapse is healthy before baibot starts and
 * baibot starts before this server, so the first attempt normally succeeds; a few more cover a
 * Synapse that is restarting. baibot may still have failed its first login or two by then, which
 * is the accepted cost: from then on it logs in, with no rooms, and waits for Provision.
 *
 * The password is the installation's API key, the file baibot reads it from too
 * (BAIBOT_USER_PASSWORD_FILE), never a word published in the repository. An installation made
 * before that still has kraftbot's old password, "kraftbot": its account is logged into with that
 * once and its password changed to the key, through the account's own password endpoint.
 *
 * Server-side only.
 */
import { readDataPallasApiKey } from './datapallas-api-key';
import { loginToMatrix, getMatrixConfig, registerUserWithSharedSecret } from '../src/services/matrix/matrixProvisioner';

const ATTEMPTS = 12;
const PAUSE_MS = 5_000;
/** What kraftbot's password was before it became the installation key (config/baibot/config.yml). */
const LEGACY_PASSWORD = 'kraftbot';

export async function ensureKraftbotAccount(): Promise<void> {
  const username = process.env.KRAFTBOT_USERNAME || 'kraftbot';
  const password = process.env.KRAFTBOT_PASSWORD || readDataPallasApiKey();

  if (!password) {
    console.error('[kraftbot] no password for the bot: config/_internal/api-key.txt is not mounted ' +
      'and KRAFTBOT_PASSWORD is not set, so the account is not made.');
    return;
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await registerUserWithSharedSecret({ username, password, displayName: username, admin: false });
      console.log(`[kraftbot] account ready at AI Hub start (attempt ${attempt})`);
      return;
    } catch (error) {
      const message = (error as Error).message;
      // The account is there and the key does not open it: an installation from before the key.
      if (message.includes('M_FORBIDDEN')) {
        await moveToTheKey(username, password);
        return;
      }
      if (attempt === ATTEMPTS) {
        console.error(`[kraftbot] the account could not be made at AI Hub start: ${message}. ` +
          'The bot cannot log in until Provision makes it.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }
}

/** Log in with the old password once and change it to the key; no admin is needed for one's own. */
async function moveToTheKey(username: string, key: string): Promise<void> {
  let accessToken: string;
  try {
    accessToken = (await loginToMatrix(username, LEGACY_PASSWORD)).accessToken;
  } catch {
    console.error(`[kraftbot] the account exists, but neither the installation key nor the old password ` +
      `opens it - most likely config/_internal/api-key.txt was deleted and made again after the account ` +
      `was moved to the old key. The bot cannot log in until its password is reset by hand.`);
    return;
  }

  const response = await fetch(`${getMatrixConfig().homeserverUrl}/_matrix/client/v3/account/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      new_password: key,
      logout_devices: false,
      auth: {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: username },
        password: LEGACY_PASSWORD,
      },
    }),
  });
  if (!response.ok) {
    console.error(`[kraftbot] the old password opened the account, but changing it to the installation ` +
      `key was refused: ${response.status} ${await response.text()}`);
    return;
  }
  console.log('[kraftbot] the account had the old password; it is the installation key now');
}

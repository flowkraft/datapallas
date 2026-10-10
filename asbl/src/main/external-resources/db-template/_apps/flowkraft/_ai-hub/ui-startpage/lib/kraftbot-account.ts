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
 * Server-side only.
 */
import { registerUserWithSharedSecret } from '../src/services/matrix/matrixProvisioner';

const ATTEMPTS = 12;
const PAUSE_MS = 5_000;

export async function ensureKraftbotAccount(): Promise<void> {
  const username = process.env.KRAFTBOT_USERNAME || 'kraftbot';
  const password = process.env.KRAFTBOT_PASSWORD || 'kraftbot';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await registerUserWithSharedSecret({ username, password, displayName: username, admin: false });
      console.log(`[kraftbot] account ready at AI Hub start (attempt ${attempt})`);
      return;
    } catch (error) {
      const message = (error as Error).message;
      if (attempt === ATTEMPTS) {
        console.error(`[kraftbot] the account could not be made at AI Hub start: ${message}. ` +
          'The bot cannot log in until Provision makes it.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }
}

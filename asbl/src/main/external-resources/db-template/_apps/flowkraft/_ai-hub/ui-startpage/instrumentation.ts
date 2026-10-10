/**
 * Runs once when the AI Hub server starts (the Next.js instrumentation hook).
 *
 * The Matrix bot (baibot) logs in as kraftbot the moment its container starts, but the kraftbot
 * account used to be made only by Provision (matrixProvisioner, step 1b). On an installation nobody
 * had provisioned yet the bot's login was refused, the container exited and Docker restarted it,
 * every minute, for as long as the AI Hub ran. The account is now made here, at start, with the very
 * function step 1b uses; Provision still makes it too (a second call finds it there) and still does
 * everything else: the rooms, the invites, the handlers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureKraftbotAccount } = await import('./lib/kraftbot-account');
  // Not awaited: the AI Hub answers while Synapse is still being asked.
  void ensureKraftbotAccount();
}

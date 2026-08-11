'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDpSession } from '@/components/layout/DpSession';

/**
 * {@code /login} — a route that exists because people type it.
 *
 * <p>The AI Hub has no login page of its own by design: {@code SignInGate} in the layout renders the
 * sign-in form over whatever page you were trying to reach, so signing in returns you to that page
 * rather than to a lobby. But "no login page" and "/login is a 404" are different things, and the
 * second one is just rude to somebody who guessed the address — or who was sent it by a colleague.
 *
 * <p>So: signed out, the gate above this component shows the form and this renders nothing. Signed
 * in, there is nothing to log into, so it hands them to the app.
 */
export default function LoginPage() {
  const router = useRouter();
  const { needsSignIn, resolved } = useDpSession();

  useEffect(() => {
    if (resolved && !needsSignIn) router.replace('/');
  }, [resolved, needsSignIn, router]);

  return null;
}

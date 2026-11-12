/**
 * Sign-out notifications for client state that lives outside MSAL.
 * React providers subscribe so that every sign-out path clears their in-memory state.
 */
const signOutListeners = new Set<() => void>();

/** Register a listener that runs each time the app clears the local session. */
export function subscribeSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => {
    signOutListeners.delete(listener);
  };
}

/** Notify all listeners that the local session was cleared. */
export function notifySignOut(): void {
  signOutListeners.forEach((listener) => listener());
}

let leavingForSignOut = false;

/**
 * Mark that the app is about to reload because it signed the user out. The page then
 * must not show a "Leave site?" prompt: the tokens are already gone, so staying on the
 * page would leave a signed-out dashboard.
 */
export function markLeavingForSignOut(): void {
  leavingForSignOut = true;
}

/** True once the app started a reload for a sign-out. */
export function isLeavingForSignOut(): boolean {
  return leavingForSignOut;
}

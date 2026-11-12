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

/**
 * Authentication boundary.
 *
 * Phase 1 intentionally does not implement registration, passwords, sessions,
 * or a backend. Keeping this module separate means authentication can be added
 * later without putting login code inside individual games.
 */

export function getCurrentUser() {
  // Future: return the authenticated user from the backend/session.
  return null;
}

export function isLoggedIn() {
  return getCurrentUser() !== null;
}

"use client";
// One browser-side registry. Server actions are invoked only by the configured provider.
type Guard = () => boolean;
const guards = new Set<Guard>();
let signOut: (() => Promise<void>) | null = null;
let signingOut = false;
let departing = false;
export function registerLeaveGuard(guard: Guard) { guards.add(guard); return () => { guards.delete(guard); }; }
export function hasLeaveGuards() { return !departing && guards.size > 0; }
export function confirmLeave() { return departing || [...guards].every(guard => guard()); }
export function configureSignOut(action: () => Promise<void>) { signOut = action; return () => { if (signOut === action) signOut = null; }; }
export async function performSignOut(action: () => void | Promise<void>) {
  departing = true;
  try { await action(); } finally { departing = false; }
}
/** All sign-out controls call this, without invoking their own action/slot. */
export async function requestSignOut() {
  if (signingOut || !signOut || !confirmLeave()) return;
  signingOut = true;
  try { await signOut(); } finally { signingOut = false; }
}

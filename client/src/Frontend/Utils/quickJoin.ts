/**
 * Quick join: optional default local account (address hex) stored in localStorage.
 * When unset, Quick join uses the newest eligible local account (last in getAccounts() order).
 * Pass booth addresses as excludeAddresses so those keys are never chosen automatically.
 */

import type { Account } from '../../Backend/Network/AccountManager';

const STORAGE_KEY_QUICK_JOIN_DEFAULT = 'dfares:quickJoinDefaultAccount';

export function getQuickJoinDefaultAccount(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY_QUICK_JOIN_DEFAULT);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setQuickJoinDefaultAccount(address: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_QUICK_JOIN_DEFAULT, address);
  } catch {
    /* storage full or unavailable */
  }
}

export function clearQuickJoinDefaultAccount(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_QUICK_JOIN_DEFAULT);
  } catch {
    /* noop */
  }
}

/**
 * Pick the account Quick join should use: saved default if still present,
 * otherwise the last eligible account (newest by addAccount order).
 * Addresses in `excludeAddresses` (lowercase) are skipped, including a saved default.
 */
export function resolveQuickJoinAccount(
  accounts: Account[],
  excludeAddresses?: ReadonlySet<string>
): Account | undefined {
  const eligible = excludeAddresses
    ? accounts.filter((account) => !excludeAddresses.has(account.address.toLowerCase()))
    : accounts;
  if (eligible.length === 0) return undefined;

  const preferred = getQuickJoinDefaultAccount();
  if (preferred) {
    const found = eligible.find((account) => account.address === preferred);
    if (found) return found;
  }

  return eligible[eligible.length - 1];
}

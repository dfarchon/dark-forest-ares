import { utils } from 'ethers';

export const EXHIBITION_ACCOUNTS_URL = '/public/booth-accounts.json';
const BOOTH_ACCOUNT_QUERY = 'booth';
const LEGACY_SELECTED_ACCOUNT_KEY = 'dfares:exhibitionAccountId';

export type ExhibitionSpawn = { x: number; y: number };

export type ExhibitionAccount = {
  id: string;
  label: string;
  privateKey: string;
  publicKey: string;
  spawn: ExhibitionSpawn | null;
  keyMatches: boolean;
  spawnValid: boolean;
};

export function boothAccountIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(BOOTH_ACCOUNT_QUERY);
  return value && value.length > 0 ? value : null;
}

export function clearLegacyExhibitionAccountId(): void {
  try {
    sessionStorage.removeItem(LEGACY_SELECTED_ACCOUNT_KEY);
  } catch {
    /* storage unavailable */
  }
}

function isSpawn(value: unknown): value is ExhibitionSpawn {
  if (!value || typeof value !== 'object') return false;
  const spawn = value as { x?: unknown; y?: unknown };
  return (
    typeof spawn.x === 'number' &&
    typeof spawn.y === 'number' &&
    Number.isFinite(spawn.x) &&
    Number.isFinite(spawn.y)
  );
}

export function parseExhibitionAccounts(payload: unknown): ExhibitionAccount[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { accounts?: unknown }).accounts)) {
    throw new Error('Exhibition accounts file must contain an accounts array.');
  }

  return (payload as { accounts: unknown[] }).accounts.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Exhibition account at index ${index} is not an object.`);
    }
    const account = entry as Partial<ExhibitionAccount>;
    if (typeof account.id !== 'string' || account.id.length === 0) {
      throw new Error(`Exhibition account at index ${index} is missing id.`);
    }
    if (typeof account.label !== 'string' || account.label.length === 0) {
      throw new Error(`Exhibition account ${account.id} is missing label.`);
    }
    if (typeof account.privateKey !== 'string' || typeof account.publicKey !== 'string') {
      throw new Error(`Exhibition account ${account.id} is missing a key.`);
    }

    let keyMatches = false;
    try {
      keyMatches =
        utils.getAddress(utils.computeAddress(account.privateKey)).toLowerCase() ===
        account.publicKey.toLowerCase();
    } catch {
      keyMatches = false;
    }

    const spawn = account.spawn === null || account.spawn === undefined ? null : account.spawn;
    return {
      id: account.id,
      label: account.label,
      privateKey: account.privateKey,
      publicKey: account.publicKey,
      spawn: isSpawn(spawn) ? spawn : null,
      keyMatches,
      spawnValid: isSpawn(spawn),
    };
  });
}

export async function loadExhibitionAccounts(): Promise<ExhibitionAccount[]> {
  const response = await fetch(EXHIBITION_ACCOUNTS_URL);
  if (!response.ok) {
    throw new Error(
      'Could not load booth accounts. Generate eth/booth/accounts.json and restart the client.'
    );
  }
  return parseExhibitionAccounts(await response.json());
}

export function exhibitionEntryMessage(account: ExhibitionAccount, status: {
  balanceWei: bigint;
} | null): { canEnter: boolean; message: string } {
  if (!account.keyMatches || !account.spawnValid) {
    return {
      canEnter: false,
      message: 'Configuration error: the private key does not match the public key, or spawn is missing.',
    };
  }
  if (!status) {
    return { canEnter: false, message: 'Balance is still loading.' };
  }
  if (status.balanceWei === BigInt(0)) {
    return {
      canEnter: false,
      message: 'Balance is 0. Ask an admin to run the eth/booth fund script.',
    };
  }
  return {
    canEnter: true,
    message: 'Click to enter at this spawn center and start mining.',
  };
}

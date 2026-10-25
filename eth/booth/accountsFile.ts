import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

export const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');

export type BoothSpawn = { x: number; y: number };

export type BoothAccount = {
  id: string;
  label: string;
  privateKey: string;
  publicKey: string;
  spawn: BoothSpawn | null;
};

export type BoothAccountsFile = {
  accounts: BoothAccount[];
};

export function derivedAddress(privateKey: string): string {
  return ethers.utils.getAddress(ethers.utils.computeAddress(privateKey));
}

export function keysMatch(account: BoothAccount): boolean {
  try {
    return derivedAddress(account.privateKey).toLowerCase() === account.publicKey.toLowerCase();
  } catch {
    return false;
  }
}

function isSpawn(value: unknown): value is BoothSpawn {
  if (!value || typeof value !== 'object') return false;
  const spawn = value as { x?: unknown; y?: unknown };
  return (
    typeof spawn.x === 'number' &&
    typeof spawn.y === 'number' &&
    Number.isFinite(spawn.x) &&
    Number.isFinite(spawn.y)
  );
}

export function readAccountsFile(filePath: string = ACCOUNTS_PATH): BoothAccountsFile {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Accounts file not found at ${filePath}. Run booth:generate first.`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as { accounts?: unknown };
  if (!parsed || !Array.isArray(parsed.accounts)) {
    throw new Error('accounts.json must contain an accounts array');
  }

  const accounts: BoothAccount[] = parsed.accounts.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Account at index ${index} is not an object`);
    }
    const account = entry as Partial<BoothAccount>;
    if (typeof account.id !== 'string' || account.id.length === 0) {
      throw new Error(`Account at index ${index} is missing id`);
    }
    if (typeof account.label !== 'string' || account.label.length === 0) {
      throw new Error(`Account ${account.id} is missing label`);
    }
    if (typeof account.privateKey !== 'string' || typeof account.publicKey !== 'string') {
      throw new Error(`Account ${account.id} is missing privateKey or publicKey`);
    }
    if (account.spawn !== null && account.spawn !== undefined && !isSpawn(account.spawn)) {
      throw new Error(`Account ${account.id} has an invalid spawn`);
    }
    return {
      id: account.id,
      label: account.label,
      privateKey: account.privateKey,
      publicKey: ethers.utils.isAddress(account.publicKey)
        ? ethers.utils.getAddress(account.publicKey)
        : account.publicKey,
      spawn: account.spawn ?? null,
    };
  });

  return { accounts };
}

export function writeAccountsFile(file: BoothAccountsFile, filePath: string = ACCOUNTS_PATH) {
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2) + '\n');
}

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

interface LicensePayload {
  licenseId: string;
  customerName: string;
  issuedAt: string;
  validFrom: string;
  expiresAt: string;
  deviceBinding: boolean;
  deviceFingerprint: string;
  maxDevices: number;
  features: string[];
  version: number;
}

interface LicenseFile {
  payload: LicensePayload;
  signature: string;
}

function parseArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.findIndex((item) => item === flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function requireArg(flag: string): string {
  const value = parseArg(flag);
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

function stableCanonicalStringify(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(canonicalize);
    }

    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = canonicalize(record[key]);
          return acc;
        }, {});
    }

    return input;
  };

  return JSON.stringify(canonicalize(value));
}

function makeLicenseId(): string {
  return `LIC-${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;
}

function toSecretKey(privateKeyBase64: string): Uint8Array {
  const raw = naclUtil.decodeBase64(privateKeyBase64);

  if (raw.length === nacl.sign.secretKeyLength) {
    return raw;
  }

  if (raw.length === nacl.sign.seedLength) {
    return nacl.sign.keyPair.fromSeed(raw).secretKey;
  }

  throw new Error(
    `Invalid private key length. Expected ${nacl.sign.seedLength} (seed) or ${nacl.sign.secretKeyLength} (secretKey) bytes.`
  );
}

function assertValidIsoDate(label: string, value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is not a valid ISO date: ${value}`);
  }
}

async function main(): Promise<void> {
  const customerName = requireArg('--customerName');
  const expiresAt = requireArg('--expiresAt');
  const deviceFingerprint = requireArg('--deviceFingerprint');

  const privateKeyBase64 = parseArg('--privateKeyBase64') || process.env.LICENSE_PRIVATE_KEY_BASE64;
  if (!privateKeyBase64) {
    throw new Error('Provide private key via --privateKeyBase64 or LICENSE_PRIVATE_KEY_BASE64');
  }

  const issuedAt = parseArg('--issuedAt') || new Date().toISOString();
  const validFrom = parseArg('--validFrom') || issuedAt;
  const licenseId = parseArg('--licenseId') || makeLicenseId();
  const features = (parseArg('--features') || 'sales,inventory,reports')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const maxDevices = Number(parseArg('--maxDevices') || '1');
  const deviceBinding = (parseArg('--deviceBinding') || 'true').toLowerCase() !== 'false';
  const outputPath = path.resolve(process.cwd(), parseArg('--out') || 'license.json');

  assertValidIsoDate('issuedAt', issuedAt);
  assertValidIsoDate('validFrom', validFrom);
  assertValidIsoDate('expiresAt', expiresAt);

  if (!Number.isInteger(maxDevices) || maxDevices < 1) {
    throw new Error('maxDevices must be an integer >= 1');
  }

  if (features.length === 0) {
    throw new Error('features cannot be empty');
  }

  const secretKey = toSecretKey(privateKeyBase64);
  const keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);

  const payload: LicensePayload = {
    licenseId,
    customerName,
    issuedAt,
    validFrom,
    expiresAt,
    deviceBinding,
    deviceFingerprint: deviceBinding ? deviceFingerprint : '',
    maxDevices,
    features,
    version: 1,
  };

  const canonicalPayload = stableCanonicalStringify(payload);
  const signatureBytes = nacl.sign.detached(naclUtil.decodeUTF8(canonicalPayload), keyPair.secretKey);

  const licenseFile: LicenseFile = {
    payload,
    signature: naclUtil.encodeBase64(signatureBytes),
  };

  await fs.writeFile(outputPath, `${JSON.stringify(licenseFile, null, 2)}\n`, 'utf8');

  console.log(`License generated: ${outputPath}`);
  console.log(`Public key (base64) for app main.ts: ${naclUtil.encodeBase64(keyPair.publicKey)}`);
  console.log('Private key stays outside app binaries.');
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to generate license: ${message}`);
  process.exitCode = 1;
});

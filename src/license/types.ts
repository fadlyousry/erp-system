export type LicenseState =
  | 'NO_LICENSE'
  | 'ACTIVE'
  | 'TRIAL_ACTIVE'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'NOT_YET_VALID'
  | 'DEVICE_MISMATCH'
  | 'CORRUPT';

export interface LicensePayload {
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

export interface LicenseFile {
  payload: LicensePayload;
  signature: string;
}

export type LicenseDetails = Pick<
  LicensePayload,
  'customerName' | 'expiresAt' | 'licenseId' | 'features'
>;

export interface LicenseStatus {
  status: LicenseState;
  messageAr: string;
  details?: LicenseDetails;
}

export interface LicensingApi {
  getStatus: () => Promise<LicenseStatus>;
  activateFromJson: (
    licenseJsonText: string,
    options?: { dryRun?: boolean }
  ) => Promise<LicenseStatus>;
  remove: () => Promise<LicenseStatus>;
  getDeviceFingerprint: () => Promise<string>;
}

declare global {
  interface Window {
    licensing: LicensingApi;
    api?: Record<string, unknown>;
  }
}

export {};

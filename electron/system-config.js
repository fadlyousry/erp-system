const fs = require('fs/promises');
const path = require('path');

const DEFAULT_BACKUP_SETTINGS = {
    directoryPath: '',
    autoBackupOnOpen: false,
    autoBackupOnClose: false,
    intervalEnabled: false,
    intervalValue: 6,
    intervalUnit: 'hours',
    retentionEnabled: false,
    retentionDays: 30,
    lastBackupAt: null,
    lastBackupPath: '',
    lastBackupReason: '',
    lastBackupError: '',
    lastCleanupAt: null,
    lastCleanupDeletedCount: 0
};

const DEFAULT_SECONDARY_BACKUP_SETTINGS = {
    ...DEFAULT_BACKUP_SETTINGS,
    enabled: false
};

const DEFAULT_DATABASE_CONFIG = {
    mode: 'local_server',
    configured: false,
    host: '',
    port: 5433,
    databaseName: '',
    appUser: '',
    appPassword: '',
    dataDir: ''
};

const DEFAULT_MARKETING_SETTINGS = {
    provider: 'gemini',
    geminiApiKey: '',
    groqApiKey: '',
    showQuickMarketingInProducts: true
};

const DEFAULT_SYSTEM_CONFIG = {
    setupCompleted: false,
    setupCompletedAt: null,
    companyName: '',
    companyContactNumbers: '',
    companyAddress: '',
    database: { ...DEFAULT_DATABASE_CONFIG },
    backupSettings: { ...DEFAULT_BACKUP_SETTINGS },
    secondaryBackupSettings: { ...DEFAULT_SECONDARY_BACKUP_SETTINGS },
    marketingSettings: { ...DEFAULT_MARKETING_SETTINGS }
};

const normalizeCompanyName = (value) => String(value ?? '')
    .trim()
    .slice(0, 120);

const normalizeCompanyContactNumbers = (value) => String(value ?? '')
    .trim()
    .slice(0, 500);

const normalizeCompanyAddress = (value) => String(value ?? '')
    .trim()
    .slice(0, 250);
const normalizeDatabaseMode = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'remote_client' ? 'remote_client' : 'local_server';
};
const normalizeDatabaseHost = (value) => String(value ?? '')
    .trim()
    .slice(0, 255);
const normalizeDatabaseName = (value) => String(value ?? '')
    .trim()
    .slice(0, 120);
const normalizeDatabaseUser = (value) => String(value ?? '')
    .trim()
    .slice(0, 120);
const normalizeDatabasePassword = (value) => String(value ?? '')
    .trim()
    .slice(0, 255);

const normalizeBoolean = (value) => value === true;
const normalizeText = (value, maxLength) => String(value ?? '')
    .trim()
    .slice(0, maxLength);
const normalizeNullableDateString = (value) => {
    const text = String(value ?? '').trim();
    return text || null;
};
const normalizePositiveInteger = (value, fallback, minimum = 1, maximum = 100000) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(maximum, Math.max(minimum, parsed));
};
const normalizeNonNegativeInteger = (value, fallback = 0, maximum = 100000) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(maximum, Math.max(0, parsed));
};
const normalizeBackupIntervalUnit = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'minutes' || normalized === 'hours' || normalized === 'days') {
        return normalized;
    }
    return DEFAULT_BACKUP_SETTINGS.intervalUnit;
};
const normalizeBackupDirectoryPath = (value) => normalizeText(value, 500);
const normalizeBackupReason = (value) => normalizeText(value, 60);
const normalizeBackupSettings = (backupSettings = {}) => ({
    ...DEFAULT_BACKUP_SETTINGS,
    ...backupSettings,
    directoryPath: normalizeBackupDirectoryPath(backupSettings?.directoryPath),
    autoBackupOnOpen: normalizeBoolean(backupSettings?.autoBackupOnOpen),
    autoBackupOnClose: normalizeBoolean(backupSettings?.autoBackupOnClose),
    intervalEnabled: normalizeBoolean(backupSettings?.intervalEnabled),
    intervalValue: normalizePositiveInteger(
        backupSettings?.intervalValue,
        DEFAULT_BACKUP_SETTINGS.intervalValue,
        1,
        3650
    ),
    intervalUnit: normalizeBackupIntervalUnit(backupSettings?.intervalUnit),
    retentionEnabled: normalizeBoolean(backupSettings?.retentionEnabled),
    retentionDays: normalizePositiveInteger(
        backupSettings?.retentionDays,
        DEFAULT_BACKUP_SETTINGS.retentionDays,
        1,
        3650
    ),
    lastBackupAt: normalizeNullableDateString(backupSettings?.lastBackupAt),
    lastBackupPath: normalizeText(backupSettings?.lastBackupPath, 500),
    lastBackupReason: normalizeBackupReason(backupSettings?.lastBackupReason),
    lastBackupError: normalizeText(backupSettings?.lastBackupError, 500),
    lastCleanupAt: normalizeNullableDateString(backupSettings?.lastCleanupAt),
    lastCleanupDeletedCount: normalizeNonNegativeInteger(backupSettings?.lastCleanupDeletedCount)
});
const normalizeDatabaseConfig = (databaseConfig = {}) => {
    const mode = normalizeDatabaseMode(databaseConfig?.mode);
    const host = normalizeDatabaseHost(databaseConfig?.host);
    const databaseName = normalizeDatabaseName(databaseConfig?.databaseName);
    const appUser = normalizeDatabaseUser(databaseConfig?.appUser);
    const appPassword = normalizeDatabasePassword(databaseConfig?.appPassword);
    const port = normalizePositiveInteger(databaseConfig?.port, DEFAULT_DATABASE_CONFIG.port, 1, 65535);
    const dataDir = normalizeText(databaseConfig?.dataDir, 500);
    const configured = normalizeBoolean(databaseConfig?.configured)
        && Boolean(host)
        && Boolean(databaseName)
        && Boolean(appUser);

    return {
        ...DEFAULT_DATABASE_CONFIG,
        ...databaseConfig,
        mode,
        configured,
        host,
        port,
        databaseName,
        appUser,
        appPassword,
        dataDir
    };
};

const getSystemConfigPath = (app) => path.join(app.getPath('userData'), 'system-config.json');

const normalizeSystemConfig = (config = {}) => ({
    ...DEFAULT_SYSTEM_CONFIG,
    ...config,
    setupCompleted: normalizeBoolean(config?.setupCompleted),
    setupCompletedAt: typeof config?.setupCompletedAt === 'string' ? config.setupCompletedAt : null,
    companyName: normalizeCompanyName(config?.companyName),
    companyContactNumbers: normalizeCompanyContactNumbers(config?.companyContactNumbers),
    companyAddress: normalizeCompanyAddress(config?.companyAddress),
    database: normalizeDatabaseConfig(config?.database),
    backupSettings: normalizeBackupSettings(config?.backupSettings),
    secondaryBackupSettings: {
        ...normalizeBackupSettings(config?.secondaryBackupSettings),
        enabled: normalizeBoolean(config?.secondaryBackupSettings?.enabled)
    },
    marketingSettings: {
        provider: normalizeText(config?.marketingSettings?.provider || 'gemini', 50),
        geminiApiKey: normalizeText(config?.marketingSettings?.geminiApiKey, 255),
        groqApiKey: normalizeText(config?.marketingSettings?.groqApiKey, 255),
        showQuickMarketingInProducts: config?.marketingSettings?.showQuickMarketingInProducts !== false
    }
});

const readSystemConfig = async (app) => {
    try {
        const raw = await fs.readFile(getSystemConfigPath(app), 'utf8');
        try {
            return normalizeSystemConfig(JSON.parse(raw));
        } catch (parseError) {
            console.error('[system-config] JSON parse error (file may be corrupted):', parseError);
            return { ...DEFAULT_SYSTEM_CONFIG };
        }
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return { ...DEFAULT_SYSTEM_CONFIG };
        }
        throw error;
    }
};

const writeSystemConfig = async (app, partialConfig = {}) => {
    const current = await readSystemConfig(app);
    const next = normalizeSystemConfig({
        ...current,
        ...partialConfig
    });

    await fs.mkdir(path.dirname(getSystemConfigPath(app)), { recursive: true });
    await fs.writeFile(
        getSystemConfigPath(app),
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8'
    );

    return next;
};

module.exports = {
    DEFAULT_BACKUP_SETTINGS,
    DEFAULT_SYSTEM_CONFIG,
    getSystemConfigPath,
    normalizeBackupDirectoryPath,
    normalizeBackupSettings,
    normalizeCompanyAddress,
    normalizeCompanyContactNumbers,
    normalizeCompanyName,
    normalizeDatabaseConfig,
    normalizeDatabaseHost,
    normalizeDatabaseMode,
    normalizeDatabaseName,
    normalizeDatabasePassword,
    normalizeDatabaseUser,
    normalizeSystemConfig,
    readSystemConfig,
    writeSystemConfig
};

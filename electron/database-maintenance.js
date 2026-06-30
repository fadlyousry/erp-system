const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const {
    findPostgresBinDir,
    parseDatabaseConfig,
    runProcess
} = require('./postgres-bootstrap');
const {
    normalizeBackupSettings,
    normalizeSystemConfig,
    readSystemConfig,
    writeSystemConfig
} = require('./system-config');

const MANAGED_BACKUP_PREFIX = 'erp-backup-';
const DEFAULT_BACKUP_DIRECTORY_NAME = 'Sales Manager Backups';

const sanitizeBackupReason = (reason) => {
    const normalized = String(reason ?? 'manual').trim().toLowerCase();
    if (normalized === 'startup' || normalized === 'interval' || normalized === 'shutdown') {
        return normalized;
    }
    return 'manual';
};

const buildBackupBaseName = (reason = 'manual') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${MANAGED_BACKUP_PREFIX}${yyyy}-${mm}-${dd}-${hh}${min}${ss}-${sanitizeBackupReason(reason)}`;
};

const getSettingsSidecarPath = (backupPath) => `${backupPath}.settings.json`;

const getDefaultBackupDirectory = (app) => path.join(
    app.getPath('documents'),
    DEFAULT_BACKUP_DIRECTORY_NAME
);

const resolveBackupDirectory = ({ app, systemConfig, directoryPath, isSecondary = false }) => {
    const explicitPath = String(directoryPath ?? '').trim();
    if (explicitPath) {
        return explicitPath;
    }

    const settings = isSecondary ? systemConfig?.secondaryBackupSettings : systemConfig?.backupSettings;
    const configuredPath = String(settings?.directoryPath ?? '').trim();
    if (configuredPath) {
        return configuredPath;
    }

    return getDefaultBackupDirectory(app);
};

const ensureDirectory = async (directoryPath) => {
    await fsp.mkdir(directoryPath, { recursive: true });
    return directoryPath;
};

const assertServerDatabaseMaintenanceAllowed = async (app) => {
    const systemConfig = await readSystemConfig(app);
    if (systemConfig?.database?.mode === 'remote_client') {
        throw new Error('النسخ الاحتياطي والاسترجاع متاحان فقط على الجهاز الذي يستضيف قاعدة البيانات.');
    }
};

const ensureUniqueBackupPath = async (targetPath) => {
    const parsed = path.parse(targetPath);
    let candidatePath = targetPath;
    let suffix = 1;

    while (fs.existsSync(candidatePath)) {
        suffix += 1;
        candidatePath = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
    }

    return candidatePath;
};

const getBackupIntervalMilliseconds = (backupSettings = {}) => {
    const normalized = normalizeBackupSettings(backupSettings);
    const unit = normalized.intervalUnit;
    const value = normalized.intervalValue;

    if (unit === 'minutes') {
        return value * 60 * 1000;
    }
    if (unit === 'days') {
        return value * 24 * 60 * 60 * 1000;
    }
    return value * 60 * 60 * 1000;
};

const updateBackupSettingsState = async (app, partialBackupSettings = {}, isSecondary = false) => {
    const currentConfig = await readSystemConfig(app);
    const key = isSecondary ? 'secondaryBackupSettings' : 'backupSettings';
    return writeSystemConfig(app, {
        [key]: {
            ...currentConfig[key],
            ...partialBackupSettings
        }
    });
};

const ensurePostgresTools = (config) => {
    const binDir = findPostgresBinDir(config);
    if (!binDir) {
        throw new Error('تعذر العثور على أدوات PostgreSQL مثل pg_dump و pg_restore.');
    }
    return {
        binDir,
        pgDumpPath: path.join(binDir, 'pg_dump.exe'),
        pgRestorePath: path.join(binDir, 'pg_restore.exe')
    };
};

const buildAutomaticBackupTarget = async ({ app, systemConfig, directoryPath, reason, isSecondary = false }) => {
    const targetDirectory = await ensureDirectory(resolveBackupDirectory({
        app,
        systemConfig,
        directoryPath,
        isSecondary
    }));

    const filePath = await ensureUniqueBackupPath(
        path.join(targetDirectory, `${buildBackupBaseName(reason)}.backup`)
    );

    return {
        directoryPath: targetDirectory,
        filePath
    };
};

const removeFileIfExists = async (targetPath) => {
    await fsp.rm(targetPath, { force: true }).catch(() => {});
};

const cleanupOldBackups = async ({
    app,
    isSecondary = false,
    backupSettings = {},
    directoryPath,
    writeState = true
} = {}) => {
    const normalizedSettings = normalizeBackupSettings(backupSettings);
    const targetDirectory = resolveBackupDirectory({
        app,
        systemConfig: isSecondary
            ? { secondaryBackupSettings: normalizedSettings }
            : { backupSettings: normalizedSettings },
        directoryPath,
        isSecondary
    });

    if (!normalizedSettings.retentionEnabled) {
        return {
            success: true,
            retentionEnabled: false,
            directoryPath: targetDirectory,
            deletedCount: 0,
            deletedFiles: []
        };
    }

    if (!fs.existsSync(targetDirectory)) {
        return {
            success: true,
            retentionEnabled: true,
            directoryPath: targetDirectory,
            deletedCount: 0,
            deletedFiles: []
        };
    }

    const thresholdMs = Date.now() - (normalizedSettings.retentionDays * 24 * 60 * 60 * 1000);
    const deletedFiles = [];
    const entries = await fsp.readdir(targetDirectory, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.startsWith(MANAGED_BACKUP_PREFIX) || !entry.name.endsWith('.backup')) continue;

        const backupPath = path.join(targetDirectory, entry.name);
        const stats = await fsp.stat(backupPath).catch(() => null);
        if (!stats || stats.mtimeMs > thresholdMs) continue;

        const settingsPath = getSettingsSidecarPath(backupPath);
        await removeFileIfExists(backupPath);
        await removeFileIfExists(settingsPath);
        deletedFiles.push(backupPath);
    }

    const cleanupState = {
        lastCleanupAt: new Date().toISOString(),
        lastCleanupDeletedCount: deletedFiles.length
    };

    if (writeState) {
        await updateBackupSettingsState(app, cleanupState, isSecondary);
    }

    return {
        success: true,
        retentionEnabled: true,
        directoryPath: targetDirectory,
        deletedCount: deletedFiles.length,
        deletedFiles,
        ...cleanupState
    };
};

const chooseBackupDirectory = async ({ app, dialog, currentDirectoryPath } = {}) => {
    const defaultPath = String(currentDirectoryPath ?? '').trim() || getDefaultBackupDirectory(app);
    const result = await dialog.showOpenDialog({
        title: 'اختيار مجلد النسخ الاحتياطية',
        defaultPath,
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths?.[0]) {
        return { canceled: true };
    }

    return {
        success: true,
        directoryPath: result.filePaths[0]
    };
};

const backupDatabase = async ({ app, dialog, options = {} } = {}) => {
    await assertServerDatabaseMaintenanceAllowed(app);

    const config = parseDatabaseConfig();
    if (!config) {
        throw new Error('DATABASE_URL غير مضبوط.');
    }

    const { pgDumpPath } = ensurePostgresTools(config);
    const systemConfig = await readSystemConfig(app);
    const isSecondary = options.isSecondary === true;
    const backupSettings = normalizeBackupSettings(isSecondary ? systemConfig?.secondaryBackupSettings : systemConfig?.backupSettings);
    const reason = sanitizeBackupReason(options.reason);
    const useDialog = options.useDialog === true;

    let backupTarget;
    if (useDialog) {
        const targetDirectory = await ensureDirectory(resolveBackupDirectory({
            app,
            systemConfig,
            directoryPath: options.directoryPath,
            isSecondary
        }));
        const defaultPath = await ensureUniqueBackupPath(
            path.join(targetDirectory, `${buildBackupBaseName(reason)}.backup`)
        );
        const saveResult = await dialog.showSaveDialog({
            title: 'حفظ نسخة احتياطية',
            defaultPath,
            filters: [
                { name: 'Sales Manager Backup', extensions: ['backup'] }
            ]
        });

        if (saveResult.canceled || !saveResult.filePath) {
            return { canceled: true };
        }

        backupTarget = {
            directoryPath: path.dirname(saveResult.filePath),
            filePath: saveResult.filePath
        };
    } else {
        backupTarget = await buildAutomaticBackupTarget({
            app,
            systemConfig,
            directoryPath: options.directoryPath,
            reason,
            isSecondary
        });
    }

    try {
        await runProcess(pgDumpPath, [
            '-h', config.host,
            '-p', String(config.port),
            '-U', config.appUser,
            '-d', config.databaseName,
            '-F', 'c',
            '-b',
            '-f', backupTarget.filePath
        ], {
            env: {
                ...process.env,
                PGPASSWORD: config.appPassword
            },
            timeoutMs: 10 * 60 * 1000
        });

        const latestSystemConfig = await readSystemConfig(app);
        const settingsPath = getSettingsSidecarPath(backupTarget.filePath);
        await fsp.writeFile(
            settingsPath,
            `${JSON.stringify(latestSystemConfig, null, 2)}\n`,
            'utf8'
        );

        const cleanupResult = await cleanupOldBackups({
            app,
            backupSettings,
            directoryPath: backupTarget.directoryPath,
            writeState: false
        });

        const nextBackupState = {
            lastBackupAt: new Date().toISOString(),
            lastBackupPath: backupTarget.filePath,
            lastBackupReason: reason,
            lastBackupError: ''
        };

        if (cleanupResult?.lastCleanupAt) {
            nextBackupState.lastCleanupAt = cleanupResult.lastCleanupAt;
            nextBackupState.lastCleanupDeletedCount = cleanupResult.lastCleanupDeletedCount;
        }

        await updateBackupSettingsState(app, nextBackupState, isSecondary);

        return {
            success: true,
            reason,
            filePath: backupTarget.filePath,
            settingsPath,
            directoryPath: backupTarget.directoryPath,
            cleanupResult
        };
    } catch (error) {
        await updateBackupSettingsState(app, {
            lastBackupError: error?.message || String(error)
        }, isSecondary).catch(() => {});
        throw error;
    }
};

const restoreDatabase = async ({ app, dialog, dbService }) => {
    await assertServerDatabaseMaintenanceAllowed(app);

    const config = parseDatabaseConfig();
    if (!config) {
        throw new Error('DATABASE_URL غير مضبوط.');
    }

    const { pgRestorePath } = ensurePostgresTools(config);
    const currentSystemConfig = await readSystemConfig(app);
    const openResult = await dialog.showOpenDialog({
        title: 'استرجاع نسخة احتياطية',
        defaultPath: resolveBackupDirectory({ app, systemConfig: currentSystemConfig }),
        properties: ['openFile'],
        filters: [
            { name: 'Sales Manager Backup', extensions: ['backup'] }
        ]
    });

    if (openResult.canceled || !openResult.filePaths?.[0]) {
        return { canceled: true };
    }

    if (dbService?.disconnect) {
        await dbService.disconnect().catch(() => {});
    }

    await runProcess(pgRestorePath, [
        '-h', config.host,
        '-p', String(config.port),
        '-U', config.appUser,
        '-d', config.databaseName,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        openResult.filePaths[0]
    ], {
        env: {
            ...process.env,
            PGPASSWORD: config.appPassword
        },
        timeoutMs: 15 * 60 * 1000
    });

    const sidecarPath = getSettingsSidecarPath(openResult.filePaths[0]);
    let restoredSettings = false;
    if (fs.existsSync(sidecarPath)) {
        const raw = await fsp.readFile(sidecarPath, 'utf8');
        const parsed = normalizeSystemConfig(JSON.parse(raw));
        await writeSystemConfig(app, {
            ...parsed,
            backupSettings: currentSystemConfig.backupSettings
        });
        restoredSettings = true;
    }

    return {
        success: true,
        filePath: openResult.filePaths[0],
        restoredSettings,
        requiresRestart: true
    };
};

module.exports = {
    backupDatabase,
    chooseBackupDirectory,
    cleanupOldBackups,
    getBackupIntervalMilliseconds,
    getDefaultBackupDirectory,
    resolveBackupDirectory,
    restoreDatabase
};

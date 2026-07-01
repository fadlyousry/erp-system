const { app, BrowserWindow, ipcMain, dialog } = require('electron')

// ============================================
// Single Instance Lock - منع فتح أكثر من نسخة
// ============================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('[main] Another instance is already running. Quitting.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        const allWindows = BrowserWindow.getAllWindows();
        if (allWindows.length > 0) {
            const win = allWindows[0];
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

const path = require('path')
const fs = require('fs')
const os = require('os')
const { createHash } = require('crypto')
const dotenv = require('dotenv')
const Module = require('module')
const nacl = require('tweetnacl')
const naclUtil = require('tweetnacl-util')
const { machineId } = require('node-machine-id')
const { applyPackagedPrismaEngineEnv } = require('./prisma-engine-paths')
const {
    backupDatabase,
    chooseBackupDirectory,
    cleanupOldBackups,
    getBackupIntervalMilliseconds,
    getDefaultBackupDirectory,
    resolveBackupDirectory,
    restoreDatabase
} = require('./database-maintenance')
const {
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
    readSystemConfig,
    writeSystemConfig
} = require('./system-config')
const { initializePrintHandlers } = require('./main/printHandler')
const { setupAutoUpdater } = require('./auto-updater')

if (app.isPackaged && process.resourcesPath) {
    const packagedNodeModules = [
        path.join(process.resourcesPath, 'node_modules'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    ];
    const currentNodePaths = (process.env.NODE_PATH || '')
        .split(path.delimiter)
        .filter(Boolean);
    const nextNodePaths = [
        ...packagedNodeModules,
        ...currentNodePaths
    ].filter((nodePath, index, allPaths) => (
        Boolean(nodePath) && allPaths.indexOf(nodePath) === index
    ));

    if (nextNodePaths.length !== currentNodePaths.length) {
        process.env.NODE_PATH = nextNodePaths.join(path.delimiter);
        Module._initPaths();
    }
}

applyPackagedPrismaEngineEnv(process.env, {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
})

const loadEnvironmentVariables = () => {
    const candidates = [];

    if (app.isPackaged) {
        try {
            candidates.push(path.join(app.getPath('userData'), 'database.runtime.env'));
        } catch {
            // Ignore if userData path is not available yet.
        }

        candidates.push(path.join(__dirname, 'runtime.env'));

        if (process.resourcesPath) {
            candidates.push(path.join(process.resourcesPath, '.env'));
            candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', '.env'));
        }
    } else {
        candidates.push(path.join(process.cwd(), '.env'));
        candidates.push(path.join(__dirname, '..', '.env'));
        candidates.push(path.join(__dirname, 'runtime.env'));
    }

    const uniqueCandidates = candidates.filter((envPath, index, values) => (
        Boolean(envPath) && values.indexOf(envPath) === index
    ));

    for (const envPath of uniqueCandidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath, override: false });
        }
    }

    if (!process.env.DATABASE_URL) {
        console.warn('DATABASE_URL is not defined. Expected .env in one of:', uniqueCandidates);
    }
};

loadEnvironmentVariables();

const {
    buildConnectionUrl,
    ensurePostgresDatabaseReadyWithLock,
    getUserRuntimeEnvPath,
    parseDatabaseConfig,
    testPrismaConnection,
    getDefaultDataDir
} = require('./postgres-bootstrap')
const { BootstrapLockManager } = require('./bootstrap-lock')
const { registerDatabaseIpcHandlers } = require('./database-ipc-handlers')

let dbService = null;
let bootstrapLockManager = null;
let backupAutomationTimer = null;
let backupAutomationPromise = null;
let secondaryBackupAutomationTimer = null;
let secondaryBackupAutomationPromise = null;
let shutdownBackupPending = false;
let allowQuitAfterBackup = false;
let databaseHandlersRegistered = false;
let mainWindow = null;
let closePromptPending = false;
let allowMainWindowClose = false;

// Register DB IPC handlers early using a getter — they'll resolve dbService at call time
registerDatabaseIpcHandlers(() => dbService);
databaseHandlersRegistered = true;

const { registerAiMarketingHandlers } = require('./aiMarketing');
registerAiMarketingHandlers();


const normalizeAdminUsername = (value) => String(value ?? '')
    .trim()
    .slice(0, 60);

const normalizeAdminName = (value) => String(value ?? '')
    .trim()
    .slice(0, 120);

const normalizePassword = (value) => String(value ?? '')
    .trim()
    .slice(0, 120);

const isLocalHostValue = (host) => ['localhost', '127.0.0.1', '::1'].includes(
    String(host ?? '').trim().toLowerCase()
);

let databaseRuntimeState = {
    configured: false,
    ready: false,
    error: '',
    mode: 'local_server',
    lastBootstrapAt: null
};

const buildStoredDatabaseConfig = (databaseConfig = {}, mode) => normalizeDatabaseConfig({
    mode,
    configured: true,
    host: databaseConfig.host,
    port: databaseConfig.port,
    databaseName: databaseConfig.databaseName,
    appUser: databaseConfig.appUser,
    appPassword: databaseConfig.appPassword
});

const buildRuntimeEnvText = (rawUrl) => `DATABASE_URL="${String(rawUrl ?? '').trim()}"\n`;

const persistDatabaseRuntimeUrl = async (rawUrl) => {
    const targetPath = getUserRuntimeEnvPath(app);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, buildRuntimeEnvText(rawUrl), 'utf8');
    return targetPath;
};

const removePersistedDatabaseRuntimeUrl = async () => {
    const targetPath = getUserRuntimeEnvPath(app);
    await fs.promises.rm(targetPath, { force: true }).catch(() => {});
};

const parseExplicitDatabaseUrl = (rawUrl) => {
    const normalizedUrl = String(rawUrl ?? '').trim();
    if (!normalizedUrl) {
        return null;
    }

    try {
        const parsed = new URL(normalizedUrl);
        const protocol = String(parsed.protocol || '').toLowerCase();
        if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
            return null;
        }

        const appUser = decodeURIComponent(parsed.username || '').trim();
        const databaseName = String(parsed.pathname || '').replace(/^\/+/, '').trim();
        if (!appUser || !databaseName) {
            return null;
        }

        return {
            rawUrl: normalizedUrl,
            host: parsed.hostname || 'localhost',
            port: Number(parsed.port || 5433),
            databaseName,
            appUser,
            appPassword: decodeURIComponent(parsed.password || '')
        };
    } catch {
        return null;
    }
};

const buildBundledLocalDatabaseConfig = (envMap = {}) => {
    const parsedUrl = parseExplicitDatabaseUrl(envMap?.DATABASE_URL);
    const hasExplicitLocalDefaults = [
        envMap?.ERP_DB_NAME,
        envMap?.ERP_DB_USER,
        envMap?.ERP_DB_PASSWORD,
        envMap?.ERP_PG_PORT
    ].some((value) => String(value ?? '').trim());

    if (!hasExplicitLocalDefaults && (!parsedUrl || !isLocalHostValue(parsedUrl.host))) {
        return null;
    }

    const databaseName = normalizeDatabaseName(envMap?.ERP_DB_NAME) || parsedUrl?.databaseName || '';
    const appUser = normalizeDatabaseUser(envMap?.ERP_DB_USER) || parsedUrl?.appUser || '';
    if (!databaseName || !appUser) {
        return null;
    }

    const appPassword = normalizeDatabasePassword(envMap?.ERP_DB_PASSWORD) || parsedUrl?.appPassword || '';
    const port = 5433;
    const host = '127.0.0.1';
    const rawUrl = buildConnectionUrl({
        user: appUser,
        password: appPassword,
        host,
        port,
        database: databaseName
    });

    return {
        rawUrl,
        host,
        port,
        databaseName,
        appUser,
        appPassword
    };
};

const readBundledDatabaseConfig = () => {
    const candidatePaths = [
        getUserRuntimeEnvPath(app),
        path.join(__dirname, 'runtime.env'),
        path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'runtime.env')
    ].filter(Boolean);

    for (const candidatePath of candidatePaths) {
        if (!fs.existsSync(candidatePath)) {
            continue;
        }

        const parsedEnv = dotenv.parse(fs.readFileSync(candidatePath, 'utf8'));
        const config = buildBundledLocalDatabaseConfig(parsedEnv);
        if (config) {
            return config;
        }
    }

    return null;
};

const resolvePendingDatabaseConnection = (payload = {}) => {
    const databaseMode = normalizeDatabaseMode(payload?.databaseMode);

    if (databaseMode === 'remote_client') {
        const database = normalizeDatabaseConfig({
            mode: databaseMode,
            configured: true,
            host: normalizeDatabaseHost(payload?.dbHost),
            port: payload?.dbPort,
            databaseName: normalizeDatabaseName(payload?.dbName),
            appUser: normalizeDatabaseUser(payload?.dbUsername),
            appPassword: normalizeDatabasePassword(payload?.dbPassword)
        });

        if (!database.host) {
            return { error: 'عنوان السيرفر أو IP مطلوب.' };
        }
        if (!database.databaseName) {
            return { error: 'اسم قاعدة البيانات مطلوب.' };
        }
        if (!database.appUser) {
            return { error: 'اسم مستخدم قاعدة البيانات مطلوب.' };
        }

        const rawUrl = buildConnectionUrl({
            user: database.appUser,
            password: database.appPassword,
            host: database.host,
            port: database.port,
            database: database.databaseName
        });

        return {
            databaseMode,
            database,
            rawUrl
        };
    }

    // Local Server / Standalone / Server
    const hasCustomLocalSettings = Boolean(payload?.dbName) && Boolean(payload?.dbUsername);
    if (hasCustomLocalSettings) {
        const database = normalizeDatabaseConfig({
            mode: 'local_server',
            configured: true,
            host: '127.0.0.1', // Always local for local_server mode
            port: payload?.dbPort || 5433,
            databaseName: normalizeDatabaseName(payload?.dbName),
            appUser: normalizeDatabaseUser(payload?.dbUsername),
            appPassword: normalizeDatabasePassword(payload?.dbPassword),
            dataDir: payload?.dataDir
        });

        const rawUrl = buildConnectionUrl({
            user: database.appUser,
            password: database.appPassword,
            host: database.host,
            port: database.port,
            database: database.databaseName
        });

        return {
            databaseMode: 'local_server',
            database,
            rawUrl
        };
    }

    const parsed = readBundledDatabaseConfig();
    if (!parsed) {
        return { error: 'تعذر العثور على إعدادات قاعدة البيانات المحلية الافتراضية لهذه النسخة.' };
    }

    return {
        databaseMode: 'local_server',
        database: buildStoredDatabaseConfig(parsed, 'local_server'),
        rawUrl: parsed.rawUrl
    };
};

const chooseDirectory = async (title, defaultPath) => {
    const result = await dialog.showOpenDialog({
        title: title || 'اختيار مجلد',
        defaultPath: defaultPath || app.getPath('documents'),
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

const explainDatabaseConnectionFailure = (connectionResult) => {
    if (!connectionResult) {
        return 'تعذر الاتصال بقاعدة البيانات.';
    }
    if (connectionResult.code === 'P1001') {
        return 'تعذر الوصول إلى خادم PostgreSQL على العنوان المحدد.';
    }
    if (connectionResult.code === 'P1000') {
        return 'بيانات الدخول إلى قاعدة البيانات غير صحيحة.';
    }
    if (connectionResult.code === 'P1003') {
        return 'قاعدة البيانات غير موجودة على الخادم المحدد.';
    }
    return 'حدث خطأ أثناء الاتصال بقاعدة البيانات.';
};

const applyStoredDatabaseEnv = async (systemConfig) => {
    const normalizedDatabaseConfig = normalizeDatabaseConfig(systemConfig?.database);
    if (!normalizedDatabaseConfig.configured) {
        return null;
    }

    const rawUrl = buildConnectionUrl({
        user: normalizedDatabaseConfig.appUser,
        password: normalizedDatabaseConfig.appPassword,
        host: normalizedDatabaseConfig.host,
        port: normalizedDatabaseConfig.port,
        database: normalizedDatabaseConfig.databaseName
    });

    process.env.DATABASE_URL = rawUrl;
    return {
        ...normalizedDatabaseConfig,
        rawUrl
    };
};

const syncStoredDatabaseConfigFromEnvironment = async (modeOverride) => {
    const parsed = parseDatabaseConfig();
    if (!parsed) {
        return null;
    }

    const mode = normalizeDatabaseMode(
        modeOverride || (isLocalHostValue(parsed.host) ? 'local_server' : 'remote_client')
    );
    const database = buildStoredDatabaseConfig(parsed, mode);
    const config = await writeSystemConfig(app, { database });

    databaseRuntimeState = {
        ...databaseRuntimeState,
        configured: true,
        mode: database.mode
    };

    return {
        config,
        database
    };
};

const initializeDbServiceModule = () => {
    const modulePath = require.resolve('./db-service');
    delete require.cache[modulePath];
    dbService = require('./db-service');
    console.log('[initializeDbServiceModule] ✓ Database service module initialized');
    return dbService;
};

const ensureDatabaseLayerReady = async ({ modeOverride, onProgress } = {}) => {
    console.log('[ensureDatabaseLayerReady] Starting database layer initialization...');
    
    // إنشاء مدير القفل إذا لم يكن موجوداً
    if (!bootstrapLockManager) {
        bootstrapLockManager = new BootstrapLockManager(app);
    }

    try {
        const bootstrapResult = await ensurePostgresDatabaseReadyWithLock({
            app,
            BrowserWindow,
            dialog,
            isPackaged: app.isPackaged,
            lockManager: bootstrapLockManager,
            onProgress
        });

        console.log('[ensureDatabaseLayerReady] Bootstrap result:', { ok: bootstrapResult?.ok, error: bootstrapResult?.error?.message });

        databaseRuntimeState = {
            configured: Boolean(parseDatabaseConfig()),
            ready: Boolean(bootstrapResult?.ok),
            error: bootstrapResult?.ok ? '' : (bootstrapResult?.error?.message || 'تعذر الاتصال بقاعدة البيانات.'),
            mode: databaseRuntimeState.mode,
            lastBootstrapAt: new Date().toISOString()
        };

        if (!bootstrapResult?.ok) {
            console.error('[ensureDatabaseLayerReady] Bootstrap failed:', bootstrapResult?.error?.message);
            return bootstrapResult;
        }

        console.log('[ensureDatabaseLayerReady] Initializing dbService module...');
        initializeDbServiceModule();

        if (dbService && typeof dbService.syncPermissions === 'function') {
            await dbService.syncPermissions().catch(err => {
                console.error('[ensureDatabaseLayerReady] Permission sync failed:', err);
            });
        }

        const systemConfig = await readSystemConfig(app);
        const mode = normalizeDatabaseMode(
            modeOverride
            || systemConfig?.database?.mode
            || (isLocalHostValue(parseDatabaseConfig()?.host) ? 'local_server' : 'remote_client')
        );
        await syncStoredDatabaseConfigFromEnvironment(mode);

        console.log('[ensureDatabaseLayerReady] ✓ Database layer ready');
        return bootstrapResult;
    } catch (error) {
        console.error('[ensureDatabaseLayerReady] Error:', error);
        throw error;
    }
};

const getResolvedDatabaseStatus = (config) => {
    const stored = normalizeDatabaseConfig(config?.database);
    const parsed = parseDatabaseConfig();
    const mode = normalizeDatabaseMode(
        stored?.mode || (parsed && !isLocalHostValue(parsed.host) ? 'remote_client' : 'local_server')
    );

    const connection = stored.configured
        ? stored
        : parsed
            ? buildStoredDatabaseConfig(parsed, mode)
            : normalizeDatabaseConfig({ mode });

    return {
        ...connection,
        configured: stored.configured || Boolean(parsed),
        ready: databaseRuntimeState.ready,
        error: databaseRuntimeState.error || '',
        mode
    };
};

const getSetupStatus = async () => {
    const config = await readSystemConfig(app);
    return {
        setupCompleted: Boolean(config?.setupCompleted),
        database: getResolvedDatabaseStatus(config),
        defaultDataDir: getDefaultDataDir(app),
        config
    };
};

const logSystemAudit = async ({
    action,
    entityType = 'System',
    entityId = null,
    note = '',
    before = undefined,
    after = undefined,
    meta = undefined
} = {}) => {
    try {
        if (!dbService?.logSystemActivity) return;
        await dbService.logSystemActivity({
            action,
            entityType,
            entityId,
            note,
            before,
            after,
            meta
        });
    } catch (error) {
        console.warn('[system-audit] failed:', error?.message || error);
    }
};

const resetDatabaseConnectionState = async () => {
    const previousConfig = await readSystemConfig(app);
    await removePersistedDatabaseRuntimeUrl();

    const config = await writeSystemConfig(app, {
        setupCompleted: false,
        setupCompletedAt: null,
        database: {
            mode: 'local_server',
            configured: false,
            host: '',
            port: 5433,
            databaseName: '',
            appUser: '',
            appPassword: ''
        }
    });

    delete process.env.DATABASE_URL;
    dbService = null;
    clearBackupAutomationTimer();
    databaseRuntimeState = {
        configured: false,
        ready: false,
        error: '',
        mode: 'local_server',
        lastBootstrapAt: null
    };

    const result = {
        success: true,
        requiresRestart: true,
        config,
        database: normalizeDatabaseConfig(config?.database)
    };
    await logSystemAudit({
        action: 'SYSTEM_DATABASE_CONNECTION_RESET',
        entityType: 'SystemConfig',
        note: 'Reset database connection settings',
        before: previousConfig?.database,
        after: result.database
    });
    return result;
};

const saveBusinessProfile = async (payload = {}) => {
    const previousConfig = await readSystemConfig(app);
    const config = await writeSystemConfig(app, {
        companyName: normalizeCompanyName(payload?.companyName),
        companyContactNumbers: normalizeCompanyContactNumbers(payload?.companyContactNumbers),
        companyAddress: normalizeCompanyAddress(payload?.companyAddress)
    });

    const result = {
        success: true,
        config
    };
    await logSystemAudit({
        action: 'SYSTEM_BUSINESS_PROFILE_UPDATE',
        entityType: 'SystemConfig',
        note: 'Update business profile',
        before: {
            companyName: previousConfig?.companyName,
            companyContactNumbers: previousConfig?.companyContactNumbers,
            companyAddress: previousConfig?.companyAddress
        },
        after: {
            companyName: config?.companyName,
            companyContactNumbers: config?.companyContactNumbers,
            companyAddress: config?.companyAddress
        }
    });
    return result;
};

const getBackupSettingsPayload = async () => {
    const config = await readSystemConfig(app);
    return {
        success: true,
        backupSettings: config.backupSettings,
        secondaryBackupSettings: config.secondaryBackupSettings,
        defaultDirectoryPath: getDefaultBackupDirectory(app),
        resolvedDirectoryPath: resolveBackupDirectory({ app, systemConfig: config })
    };
};

const clearBackupAutomationTimer = () => {
    if (backupAutomationTimer) {
        clearInterval(backupAutomationTimer);
        backupAutomationTimer = null;
    }
    if (secondaryBackupAutomationTimer) {
        clearInterval(secondaryBackupAutomationTimer);
        secondaryBackupAutomationTimer = null;
    }
};

const getDialogParentWindow = () => (
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
);

const showAppMessageBox = async (options) => {
    const parentWindow = getDialogParentWindow();
    if (parentWindow) {
        return dialog.showMessageBox(parentWindow, options);
    }

    return dialog.showMessageBox(options);
};

const clearRendererStoredAuthState = async () => {
    const targetWindow = getDialogParentWindow();
    if (!targetWindow?.webContents || targetWindow.webContents.isDestroyed()) {
        return;
    }

    try {
        await targetWindow.webContents.executeJavaScript(`
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
            } catch (error) {
                console.error('Failed to clear stored auth state before quit:', error);
            }
        `, true);
    } catch (error) {
        console.warn('[auth] Failed to clear renderer auth state before quit:', error?.message || error);
    }
};

const backupFromClosePrompt = async () => {
    const result = await backupDatabase({
        app,
        dialog,
        options: {
            useDialog: true,
            reason: 'manual'
        }
    });

    if (result?.success) {
        await logSystemAudit({
            action: 'SYSTEM_DATABASE_BACKUP',
            entityType: 'DatabaseMaintenance',
            note: 'Create database backup from close prompt',
            after: result
        });
    }

    return result;
};

const logoutAndQuitApplication = async () => {
    try {
        if (dbService?.clearCurrentSessionUser) {
            await dbService.clearCurrentSessionUser();
        }
    } catch (error) {
        console.warn('[auth] Failed to clear current session user before quit:', error?.message || error);
    }

    await clearRendererStoredAuthState();
    allowMainWindowClose = true;
    app.quit();
};

const handleMainWindowCloseRequest = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:request-close');
    }
};




const runAutomatedBackup = async (reason, isSecondary = false) => {
    if (isSecondary) {
        if (secondaryBackupAutomationPromise) return secondaryBackupAutomationPromise;
        secondaryBackupAutomationPromise = (async () => {
            try {
                const config = await readSystemConfig(app);
                if (config?.database?.mode === 'remote_client') return { success: false, skipped: true, reason: 'remote_client' };
                const settings = config.secondaryBackupSettings;
                if (!settings?.enabled) return { success: false, skipped: true, reason: 'secondary_disabled' };

                await backupDatabase({
                    app,
                    dialog,
                    options: {
                        reason,
                        useDialog: false,
                        isSecondary: true,
                        directoryPath: settings.directoryPath
                    }
                });
            } catch (error) {
                console.error(`[backup] Secondary automatic backup failed (${reason}):`, error?.message || error);
                throw error;
            } finally {
                secondaryBackupAutomationPromise = null;
            }
        })();
        return secondaryBackupAutomationPromise;
    } else {
        if (backupAutomationPromise) return backupAutomationPromise;
        backupAutomationPromise = (async () => {
            try {
                const config = await readSystemConfig(app);
                if (config?.database?.mode === 'remote_client') return { success: false, skipped: true, reason: 'remote_client' };
                
                await backupDatabase({
                    app,
                    dialog,
                    options: {
                        reason,
                        useDialog: false,
                        isSecondary: false,
                        directoryPath: resolveBackupDirectory({ app, systemConfig: config })
                    }
                });
            } catch (error) {
                console.error(`[backup] Primary automatic backup failed (${reason}):`, error?.message || error);
                throw error;
            } finally {
                backupAutomationPromise = null;
            }
        })();
        return backupAutomationPromise;
    }
};

const refreshBackupAutomation = async () => {
    clearBackupAutomationTimer();

    const config = await readSystemConfig(app);
    if (config?.database?.mode === 'remote_client') {
        return { enabled: false, skipped: true };
    }

    // Primary Timer
    if (config.backupSettings?.intervalEnabled) {
        const intervalMs = getBackupIntervalMilliseconds(config.backupSettings);
        backupAutomationTimer = setInterval(() => {
            void runAutomatedBackup('interval', false).catch(() => {});
        }, intervalMs);
    }

    // Secondary Timer
    if (config.secondaryBackupSettings?.enabled && config.secondaryBackupSettings?.intervalEnabled) {
        const intervalMs = getBackupIntervalMilliseconds(config.secondaryBackupSettings);
        secondaryBackupAutomationTimer = setInterval(() => {
            void runAutomatedBackup('interval', true).catch(() => {});
        }, intervalMs);
    }

    return { success: true };
};

const saveBackupSettings = async (payload = {}) => {
    const currentConfig = await readSystemConfig(app);
    const isSecondary = payload.isSecondary === true;
    
    let nextConfigData = {};
    if (isSecondary) {
        nextConfigData.secondaryBackupSettings = {
            ...currentConfig.secondaryBackupSettings,
            ...payload
        };
    } else {
        nextConfigData.backupSettings = normalizeBackupSettings({
            ...currentConfig.backupSettings,
            ...payload
        });
    }

    const config = await writeSystemConfig(app, nextConfigData);
    const settingsToCleanup = isSecondary ? config.secondaryBackupSettings : config.backupSettings;

    const cleanupResult = await cleanupOldBackups({
        app,
        isSecondary,
        backupSettings: settingsToCleanup,
        directoryPath: settingsToCleanup.directoryPath || resolveBackupDirectory({ app, systemConfig: config })
    }).catch((error) => ({
        error: error?.message || String(error)
    }));

    await refreshBackupAutomation();

    return {
        success: true,
        config,
        backupSettings: config.backupSettings,
        secondaryBackupSettings: config.secondaryBackupSettings,
        defaultDirectoryPath: getDefaultBackupDirectory(app),
        resolvedDirectoryPath: resolveBackupDirectory({ app, systemConfig: config }),
        cleanupResult
    };
};

const testDatabaseConnectionSettings = async (payload = {}) => {
    const pendingConnection = resolvePendingDatabaseConnection(payload);
    if (pendingConnection?.error) {
        return pendingConnection;
    }

    const { databaseMode, database, rawUrl } = pendingConnection;
    const connectionCheck = await testPrismaConnection(rawUrl);

    if (databaseMode === 'local_server') {
        return {
            success: true,
            canConnect: Boolean(connectionCheck?.ok),
            requiresSetup: !connectionCheck?.ok,
            message: connectionCheck?.ok
                ? 'تم التحقق من الاتصال بقاعدة البيانات المحلية بنجاح.'
                : 'قاعدة البيانات المحلية ليست جاهزة بالكامل بعد. يمكن للبرنامج تجهيزها تلقائيًا عند تطبيق الاتصال.',
            details: connectionCheck?.ok ? '' : (connectionCheck?.message || explainDatabaseConnectionFailure(connectionCheck)),
            database: {
                ...database,
                ready: Boolean(connectionCheck?.ok),
                mode: 'local_server'
            }
        };
    }

    if (!connectionCheck?.ok) {
        return {
            success: false,
            canConnect: false,
            message: explainDatabaseConnectionFailure(connectionCheck),
            details: connectionCheck?.message || '',
            database: {
                ...database,
                ready: false
            }
        };
    }

    return {
        success: true,
        canConnect: true,
        requiresSetup: false,
        message: 'تم الاتصال بقاعدة البيانات بنجاح.',
        details: '',
        database: {
            ...database,
            ready: true
        }
    };
};

const legacyConfigureDatabaseConnection = async (payload = {}) => {
    const pendingConnection = resolvePendingDatabaseConnection(payload);
    if (pendingConnection?.error) {
        return pendingConnection;
    }

    const { databaseMode, database, rawUrl } = pendingConnection;
    const previousRawUrl = String(process.env.DATABASE_URL || '').trim();
    databaseRuntimeState = {
        ...databaseRuntimeState,
        configured: false,
        ready: false,
        error: '',
        mode: databaseMode
    };

    if (databaseMode === 'remote_client') {
        const database = normalizeDatabaseConfig({
            mode: databaseMode,
            configured: true,
            host: normalizeDatabaseHost(payload?.dbHost),
            port: payload?.dbPort,
            databaseName: normalizeDatabaseName(payload?.dbName),
            appUser: normalizeDatabaseUser(payload?.dbUsername),
            appPassword: normalizeDatabasePassword(payload?.dbPassword)
        });

        if (!database.host) {
            return { error: 'عنوان السيرفر أو IP مطلوب.' };
        }
        if (!database.databaseName) {
            return { error: 'اسم قاعدة البيانات مطلوب.' };
        }
        if (!database.appUser) {
            return { error: 'اسم مستخدم قاعدة البيانات مطلوب.' };
        }

        const rawUrl = buildConnectionUrl({
            user: database.appUser,
            password: database.appPassword,
            host: database.host,
            port: database.port,
            database: database.databaseName
        });

        await writeSystemConfig(app, { database });
        await persistDatabaseRuntimeUrl(rawUrl);
        process.env.DATABASE_URL = rawUrl;
    } else {
        const parsed = readBundledDatabaseConfig();
        if (!parsed) {
            return { error: 'تعذر العثور على إعدادات قاعدة البيانات المحلية الافتراضية لهذه النسخة.' };
        }
        
        await removePersistedDatabaseRuntimeUrl();
        process.env.DATABASE_URL = parsed.rawUrl;
        await writeSystemConfig(app, {
            database: buildStoredDatabaseConfig(parsed, 'local_server')
        });
    }

    const bootstrapResult = await ensureDatabaseLayerReady();
    if (!bootstrapResult?.ok) {
        return {
            error: databaseRuntimeState.error || 'تعذر تجهيز الاتصال بقاعدة البيانات.'
        };
    }

    const config = await readSystemConfig(app);
    return {
        success: true,
        config,
        database: getResolvedDatabaseStatus(config)
    };
};

const configureDatabaseConnection = async (payload = {}, onProgress = null) => {
    const previousConfig = await readSystemConfig(app);
    const pendingConnection = resolvePendingDatabaseConnection(payload);
    if (pendingConnection?.error) {
        return pendingConnection;
    }

    const { databaseMode, database, rawUrl } = pendingConnection;
    const previousRawUrl = String(process.env.DATABASE_URL || '').trim();

    databaseRuntimeState = {
        ...databaseRuntimeState,
        configured: false,
        ready: false,
        error: '',
        mode: databaseMode
    };

    process.env.DATABASE_URL = rawUrl;
    if (databaseMode === 'local_server') {
        process.env.ERP_PG_PORT = String(database.port || 5433);
        process.env.ERP_PG_DATA_DIR = database.dataDir || '';
        process.env.ERP_DB_NAME = database.databaseName;
        process.env.ERP_DB_USER = database.appUser;
        process.env.ERP_DB_PASSWORD = database.appPassword;
        process.env.ERP_PG_SERVER_MODE = String(payload?.serverMode || '');
    }

    const bootstrapResult = await ensureDatabaseLayerReady({ modeOverride: databaseMode, onProgress });
    if (!bootstrapResult?.ok) {
        if (previousRawUrl) {
            process.env.DATABASE_URL = previousRawUrl;
        } else {
            delete process.env.DATABASE_URL;
        }

        return {
            error: databaseRuntimeState.error || 'تعذر تجهيز الاتصال بقاعدة البيانات.'
        };
    }

    await writeSystemConfig(app, { database });
    if (databaseMode === 'remote_client') {
        await persistDatabaseRuntimeUrl(rawUrl);
    }

    const config = await readSystemConfig(app);
    await refreshBackupAutomation();

    const result = {
        success: true,
        config,
        database: getResolvedDatabaseStatus(config)
    };
    await logSystemAudit({
        action: 'SYSTEM_DATABASE_CONNECTION_SAVE',
        entityType: 'DatabaseConfig',
        note: 'Save database connection settings',
        before: previousConfig?.database,
        after: result.database,
        meta: { mode: databaseMode }
    });
    return result;
};

const completeFirstRunSetup = async (payload = {}, onProgress) => {
    const databaseSetupResult = await configureDatabaseConnection(payload, onProgress);
    if (databaseSetupResult?.error) {
        return databaseSetupResult;
    }
    const databaseMode = normalizeDatabaseMode(payload?.databaseMode);
    if (!dbService && databaseMode !== 'remote_client') {
        return { error: 'خدمة قاعدة البيانات غير جاهزة بعد.' };
    }

    const companyName = normalizeCompanyName(payload?.companyName);
    const companyContactNumbers = normalizeCompanyContactNumbers(payload?.companyContactNumbers);
    const companyAddress = normalizeCompanyAddress(payload?.companyAddress);
    if (databaseMode === 'remote_client') {
        const config = await writeSystemConfig(app, {
            setupCompleted: true,
            setupCompletedAt: new Date().toISOString(),
            companyName,
            companyContactNumbers,
            companyAddress
        });

        const result = {
            success: true,
            setupCompleted: true,
            database: getResolvedDatabaseStatus(config),
            config
        };
        await logSystemAudit({
            action: 'SYSTEM_FIRST_RUN_COMPLETE',
            entityType: 'SystemSetup',
            note: 'Complete first run setup',
            after: {
                setupCompleted: true,
                database: result.database,
                companyName: config?.companyName
            }
        });
        return result;
    }

    const adminName = normalizeAdminName(payload?.adminName);
    const username = normalizeAdminUsername(payload?.username);
    const password = normalizePassword(payload?.password);

    if (!companyName) {
        return { error: 'اسم النشاط مطلوب.' };
    }
    if (!adminName) {
        return { error: 'اسم المسؤول مطلوب.' };
    }
    if (!username) {
        return { error: 'اسم مستخدم المسؤول مطلوب.' };
    }
    if (password.length < 4) {
        return { error: 'كلمة المرور يجب ألا تقل عن 4 أحرف.' };
    }

    const users = await dbService.getUsers();
    if (!Array.isArray(users)) {
        const errorDetail = (users && typeof users === 'object' && users.error) ? `: ${users.error}` : '';
        return { error: `تعذر قراءة المستخدمين الحاليين${errorDetail}` };
    }

    let adminUser = users.find((user) => user?.role === 'ADMIN') || users[0] || null;
    const usernameTakenByAnotherUser = users.some((user) => (
        user?.username === username && user?.id !== adminUser?.id
    ));
    if (usernameTakenByAnotherUser) {
        return { error: 'اسم المستخدم مستخدم بالفعل.' };
    }

    if (adminUser?.id) {
        const updatedAdmin = await dbService.updateUser(adminUser.id, {
            name: adminName,
            username,
            password,
            role: 'ADMIN'
        });
        if (updatedAdmin?.error) {
            return updatedAdmin;
        }
    } else {
        const createdAdmin = await dbService.addUser({
            name: adminName,
            username,
            password,
            role: 'ADMIN'
        });
        if (createdAdmin?.error) {
            return createdAdmin;
        }
        adminUser = createdAdmin;
    }

    const config = await writeSystemConfig(app, {
        setupCompleted: true,
        setupCompletedAt: new Date().toISOString(),
        companyName,
        companyContactNumbers,
        companyAddress
    });

    const result = {
        success: true,
        setupCompleted: true,
        database: getResolvedDatabaseStatus(config),
        config
    };
    await logSystemAudit({
        action: 'SYSTEM_FIRST_RUN_COMPLETE',
        entityType: 'SystemSetup',
        note: 'Complete first run setup',
        after: {
            setupCompleted: true,
            database: result.database,
            companyName: config?.companyName,
            adminName
        }
    });
    return result;
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'FYC -Store Manager',
        icon: path.join(__dirname, '../public/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    })
    const win = mainWindow;

    const isDev = !app.isPackaged;

    const devCsp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:5173",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: http: file:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' ws://localhost:5173 http://localhost:5173",
        "media-src 'self' data: https://assets.mixkit.co",
    ].join("; ");

    const prodCsp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: http: file:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self'",
        "media-src 'self' data: https://assets.mixkit.co",
    ].join("; ");

    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const cspValue = isDev ? devCsp : prodCsp;
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [cspValue],
            },
        });
    });

    if (isDev) {
        console.log('🔧 Development Mode: حاول الاتصال بـ http://localhost:5173');
        win.loadURL('http://localhost:5173')
            .then(() => {
                console.log('✅ اتصال ناجح بـ Vite dev server');
            })
            .catch((err) => {
                console.error('❌ فشل الاتصال بـ dev server:', err.message);
                console.log('⚠️ تأكد من تشغيل: npm run dev');
                console.log('⏳ جاري إعادة المحاولة كل 2 ثانية...');

                // Retry connection every 2 seconds
                const retryInterval = setInterval(() => {
                    win.loadURL('http://localhost:5173')
                        .then(() => {
                            console.log('✅ اتصال ناجح!');
                            clearInterval(retryInterval);
                        })
                        .catch(() => {
                            console.log('⏳ محاولة أخرى...');
                        });
                }, 2000);
            });
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    // Initialize print handlers
    initializePrintHandlers(win);

    win.on('close', (event) => {
        if (allowMainWindowClose) {
            return;
        }

        event.preventDefault();
        if (closePromptPending) {
            return;
        }

        closePromptPending = true;
        void handleMainWindowCloseRequest().finally(() => {
            closePromptPending = false;
        });
    });

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null;
            closePromptPending = false;
            allowMainWindowClose = false;
        }
    });
}

let activateHandlerRegistered = false;

const registerActivateWindowHandler = () => {
    if (activateHandlerRegistered) {
        return;
    }

    activateHandlerRegistered = true;
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
};

const sanitizePdfFileName = (value) => {
    const raw = String(value || '').trim();
    const cleaned = raw
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return 'labels.pdf';
    return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
};

const LICENSE_PUBLIC_KEY_BASE64 = '4eeEUQ1Fi4D1D8dC5EEPYpQfJzlF3N6z0uXpx92OX7M=';
const LICENSE_FILE_NAME = 'license.json';
const MAX_LICENSE_FILE_BYTES = 256 * 1024;
const TRIAL_FILE_NAME = 'trial.json';
const MAX_TRIAL_FILE_BYTES = 16 * 1024;
const TRIAL_PERIOD_DAYS = 3;
const TRIAL_PERIOD_MS = TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000;
const TRIAL_DURATION_TOLERANCE_MS = 60 * 1000;
const TRIAL_EXPIRED_MESSAGE_AR = `انتهت الفترة التجريبية (${TRIAL_PERIOD_DAYS} أيام). يرجى تفعيل الترخيص للمتابعة.`;

const LICENSE_STATUS_MESSAGES_AR = {
    NO_LICENSE: 'لا يوجد ترخيص مفعل على هذا الجهاز.',
    ACTIVE: 'الترخيص صالح ومفعل.',
    TRIAL_ACTIVE: 'الفترة التجريبية مفعلة.',
    EXPIRED: 'انتهت صلاحية الترخيص.',
    INVALID_SIGNATURE: 'التوقيع الرقمي غير صالح.',
    NOT_YET_VALID: 'الترخيص غير ساري حتى تاريخ البداية.',
    DEVICE_MISMATCH: 'الترخيص لا يطابق بصمة هذا الجهاز.',
    CORRUPT: 'ملف الترخيص تالف أو بصيغة غير صحيحة.'
};

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const stableCanonicalStringify = (value) => {
    const canonicalize = (input) => {
        if (Array.isArray(input)) {
            return input.map(canonicalize);
        }

        if (isRecord(input)) {
            return Object.keys(input)
                .sort()
                .reduce((acc, key) => {
                    acc[key] = canonicalize(input[key]);
                    return acc;
                }, {});
        }

        return input;
    };

    return JSON.stringify(canonicalize(value));
};

const buildLicenseStatus = (status, payload) => {
    if (!payload) {
        return {
            status,
            messageAr: LICENSE_STATUS_MESSAGES_AR[status]
        };
    }

    return {
        status,
        messageAr: LICENSE_STATUS_MESSAGES_AR[status],
        details: {
            customerName: payload.customerName,
            expiresAt: payload.expiresAt,
            licenseId: payload.licenseId,
            features: payload.features
        }
    };
};

const getLicenseFilePath = () => path.join(app.getPath('userData'), LICENSE_FILE_NAME);
const getTrialFilePath = () => path.join(app.getPath('userData'), TRIAL_FILE_NAME);

const isValidDateString = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

const parseTrialFileText = (trialJsonText) => {
    if (typeof trialJsonText !== 'string') return null;
    if (Buffer.byteLength(trialJsonText, 'utf8') > MAX_TRIAL_FILE_BYTES) return null;

    let parsed;
    try {
        parsed = JSON.parse(trialJsonText);
    } catch {
        return null;
    }

    if (!isRecord(parsed)) {
        return null;
    }

    if (!isValidDateString(parsed.startedAt) || !isValidDateString(parsed.expiresAt)) {
        return null;
    }

    const startedAtMs = Date.parse(parsed.startedAt);
    const expiresAtMs = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs)) {
        return null;
    }

    const durationMs = expiresAtMs - startedAtMs;
    if (durationMs <= 0) {
        return null;
    }

    if (Math.abs(durationMs - TRIAL_PERIOD_MS) > TRIAL_DURATION_TOLERANCE_MS) {
        return null;
    }

    return {
        startedAt: parsed.startedAt,
        expiresAt: parsed.expiresAt
    };
};

const createTrialState = () => {
    const startedAtMs = Date.now();
    const expiresAtMs = startedAtMs + TRIAL_PERIOD_MS;

    return {
        startedAt: new Date(startedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString()
    };
};

const toLicensePayload = (payload) => {
    if (!isRecord(payload)) {
        return null;
    }

    const hasRequiredStrings =
        typeof payload.licenseId === 'string' &&
        typeof payload.customerName === 'string' &&
        typeof payload.deviceFingerprint === 'string';

    const hasRequiredDates =
        isValidDateString(payload.issuedAt) &&
        isValidDateString(payload.validFrom) &&
        isValidDateString(payload.expiresAt);

    const hasBooleansAndNumbers =
        typeof payload.deviceBinding === 'boolean' &&
        typeof payload.maxDevices === 'number' &&
        Number.isInteger(payload.maxDevices) &&
        payload.maxDevices >= 1 &&
        typeof payload.version === 'number' &&
        Number.isInteger(payload.version);

    const hasFeatures =
        Array.isArray(payload.features) &&
        payload.features.length > 0 &&
        payload.features.every((item) => typeof item === 'string' && item.trim().length > 0);

    if (!hasRequiredStrings || !hasRequiredDates || !hasBooleansAndNumbers || !hasFeatures) {
        return null;
    }

    if (payload.deviceBinding && payload.deviceFingerprint.trim().length === 0) {
        return null;
    }

    return {
        licenseId: payload.licenseId,
        customerName: payload.customerName,
        issuedAt: payload.issuedAt,
        validFrom: payload.validFrom,
        expiresAt: payload.expiresAt,
        deviceBinding: payload.deviceBinding,
        deviceFingerprint: payload.deviceFingerprint,
        maxDevices: payload.maxDevices,
        features: payload.features,
        version: payload.version
    };
};

const safeDecodeBase64 = (value) => {
    try {
        return naclUtil.decodeBase64(value);
    } catch {
        return null;
    }
};

const verifyLicenseSignature = (payload, signatureBase64) => {
    const signatureBytes = safeDecodeBase64(signatureBase64);
    const publicKeyBytes = safeDecodeBase64(LICENSE_PUBLIC_KEY_BASE64);

    if (!signatureBytes || !publicKeyBytes) return false;
    if (signatureBytes.length !== nacl.sign.signatureLength) return false;
    if (publicKeyBytes.length !== nacl.sign.publicKeyLength) return false;

    const payloadBytes = naclUtil.decodeUTF8(stableCanonicalStringify(payload));
    return nacl.sign.detached.verify(payloadBytes, signatureBytes, publicKeyBytes);
};

const getDeviceFingerprint = async () => {
    let deviceId = 'unknown-device-id';
    try {
        deviceId = await machineId();
    } catch {
        deviceId = 'unknown-device-id';
    }

    const source = stableCanonicalStringify({
        machineId: deviceId,
        platform: process.platform,
        cpuModel: os.cpus()[0]?.model || 'unknown-cpu-model',
        totalmem: os.totalmem(),
        hostname: os.hostname()
    });

    return createHash('sha256').update(source, 'utf8').digest('hex');
};

const parseLicenseFileText = (licenseJsonText) => {
    if (typeof licenseJsonText !== 'string') return null;
    if (Buffer.byteLength(licenseJsonText, 'utf8') > MAX_LICENSE_FILE_BYTES) return null;

    let parsed;
    try {
        parsed = JSON.parse(licenseJsonText);
    } catch {
        return null;
    }

    if (!isRecord(parsed) || typeof parsed.signature !== 'string') {
        return null;
    }

    const payload = toLicensePayload(parsed.payload);
    if (!payload) return null;

    return {
        payload,
        signature: parsed.signature
    };
};

const evaluateLicenseText = async (licenseJsonText) => {
    const licenseFile = parseLicenseFileText(licenseJsonText);
    if (!licenseFile) {
        return { status: buildLicenseStatus('CORRUPT') };
    }

    if (!verifyLicenseSignature(licenseFile.payload, licenseFile.signature)) {
        return { status: buildLicenseStatus('INVALID_SIGNATURE', licenseFile.payload) };
    }

    const validFromMs = Date.parse(licenseFile.payload.validFrom);
    const expiresAtMs = Date.parse(licenseFile.payload.expiresAt);
    const nowMs = Date.now();

    if (!Number.isFinite(validFromMs) || !Number.isFinite(expiresAtMs)) {
        return { status: buildLicenseStatus('CORRUPT', licenseFile.payload) };
    }

    if (nowMs < validFromMs) {
        return { status: buildLicenseStatus('NOT_YET_VALID', licenseFile.payload) };
    }

    if (nowMs > expiresAtMs) {
        return { status: buildLicenseStatus('EXPIRED', licenseFile.payload) };
    }

    if (licenseFile.payload.deviceBinding) {
        const currentFingerprint = await getDeviceFingerprint();
        if (licenseFile.payload.deviceFingerprint !== currentFingerprint) {
            return { status: buildLicenseStatus('DEVICE_MISMATCH', licenseFile.payload) };
        }
    }

    return {
        status: buildLicenseStatus('ACTIVE', licenseFile.payload),
        normalized: licenseFile
    };
};

const buildTrialDetails = (trialState) => ({
    customerName: 'نسخة تجريبية',
    expiresAt: trialState.expiresAt,
    licenseId: 'TRIAL-LOCAL',
    features: [`TRIAL_${TRIAL_PERIOD_DAYS}_DAYS`]
});

const buildTrialActiveStatus = (trialState) => {
    const expiresAtMs = Date.parse(trialState.expiresAt);
    const remainingMs = Math.max(0, expiresAtMs - Date.now());
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

    return {
        status: 'TRIAL_ACTIVE',
        messageAr: `${LICENSE_STATUS_MESSAGES_AR.TRIAL_ACTIVE} متبقي ${remainingDays} يوم.`,
        details: buildTrialDetails(trialState)
    };
};

const getStatusWithoutLicense = async () => {
    const trialPath = getTrialFilePath();
    let trialState = null;

    try {
        const rawTrial = await fs.promises.readFile(trialPath, 'utf8');
        trialState = parseTrialFileText(rawTrial);
        if (!trialState) {
            return {
                status: 'NO_LICENSE',
                messageAr: TRIAL_EXPIRED_MESSAGE_AR
            };
        }
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            return buildLicenseStatus('CORRUPT');
        }
    }

    if (!trialState) {
        trialState = createTrialState();
        try {
            await fs.promises.mkdir(path.dirname(trialPath), { recursive: true });
            await fs.promises.writeFile(trialPath, `${JSON.stringify(trialState, null, 2)}\n`, 'utf8');
        } catch {
            return buildLicenseStatus('CORRUPT');
        }
    }

    const expiresAtMs = Date.parse(trialState.expiresAt);
    if (!Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) {
        return {
            status: 'NO_LICENSE',
            messageAr: TRIAL_EXPIRED_MESSAGE_AR,
            details: buildTrialDetails(trialState)
        };
    }

    return buildTrialActiveStatus(trialState);
};

const getCurrentLicenseStatus = async () => {
    try {
        const raw = await fs.promises.readFile(getLicenseFilePath(), 'utf8');
        const evaluated = await evaluateLicenseText(raw);
        return evaluated.status;
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return getStatusWithoutLicense();
        }
        return buildLicenseStatus('CORRUPT');
    }
};

const activateLicenseFromJson = async (licenseJsonText, options = {}) => {
    const evaluated = await evaluateLicenseText(licenseJsonText);
    if (evaluated.status.status !== 'ACTIVE') {
        return evaluated.status;
    }

    if (options?.dryRun) {
        return evaluated.status;
    }

    if (!evaluated.normalized) {
        return buildLicenseStatus('CORRUPT');
    }

    const licensePath = getLicenseFilePath();
    await fs.promises.mkdir(path.dirname(licensePath), { recursive: true });
    await fs.promises.writeFile(licensePath, `${JSON.stringify(evaluated.normalized, null, 2)}\n`, 'utf8');

    return getCurrentLicenseStatus();
};

const removeCurrentLicense = async () => {
    try {
        await fs.promises.unlink(getLicenseFilePath());
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            return buildLicenseStatus('CORRUPT');
        }
    }

    return getCurrentLicenseStatus();
};

// IPC Handlers
ipcMain.handle('licensing:getStatus', async () => {
    return await getCurrentLicenseStatus();
});
ipcMain.handle('licensing:activateFromJson', async (event, licenseJsonText, options) => {
    return await activateLicenseFromJson(licenseJsonText, options || {});
});
ipcMain.handle('licensing:remove', async () => {
    return await removeCurrentLicense();
});
ipcMain.handle('licensing:getDeviceFingerprint', async () => {
    return await getDeviceFingerprint();
});

ipcMain.handle('system:getSetupStatus', async () => {
    return await getSetupStatus();
});
ipcMain.handle('system:saveBusinessProfile', async (event, payload) => {
    try {
        return await saveBusinessProfile(payload || {});
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:getBackupSettings', async () => {
    try {
        return await getBackupSettingsPayload();
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:chooseBackupDirectory', async (event, payload) => {
    try {
        const currentConfig = await readSystemConfig(app);
        const result = await chooseBackupDirectory({
            app,
            dialog,
            currentDirectoryPath:
                String(payload?.currentDirectoryPath ?? '').trim() ||
                resolveBackupDirectory({ app, systemConfig: currentConfig })
        });
        if (result?.success && result?.directoryPath) {
            await logSystemAudit({
                action: 'SYSTEM_BACKUP_DIRECTORY_SELECT',
                entityType: 'BackupSettings',
                note: 'Choose backup directory',
                after: { directoryPath: result.directoryPath }
            });
        }
        return result;
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});




    ipcMain.handle('system:forceResetLocalDatabase', async () => {
        console.log('[ipc] system:forceResetLocalDatabase received');
        try {
            if (!bootstrapLockManager) {
                bootstrapLockManager = new BootstrapLockManager(app);
            }
            await bootstrapLockManager.acquireLock();
            try {
                // 1. التقاط الإعدادات الحالية قبل مسحها من الـ env
                const { parseDatabaseConfig, wipeAndRecreateDatabase } = require('./postgres-bootstrap');
                const currentConfig = parseDatabaseConfig();

                if (!currentConfig) {
                    return { success: false, error: 'لا يوجد إعدادات قاعدة بيانات نشطة للمسح.' };
                }

                // 2. تصفير حالة البرنامج (في الذاكرة وفي ملف الإعدادات)
                await resetDatabaseConnectionState();
                
                // 3. إغلاق الخدمة ومسح الملفات (نمرر الإعدادات التي التقطناها)
                dbService = null;
                clearBackupAutomationTimer();

                const result = await wipeAndRecreateDatabase({
                    app,
                    BrowserWindow,
                    dialog,
                    isPackaged: app.isPackaged,
                    configOverride: currentConfig, // نمرر الإعدادات يدوياً
                    onProgress: (message, percent) => {
                        mainWindow?.webContents.send('setup:progress', { message, percent });
                    }
                });

                if (result.success) {
                    return { success: true, needsRestart: result.needsRestart };
                } else {
                    return { success: false, error: result.error || 'فشل إعادة إنشاء قاعدة البيانات.' };
                }
            } finally {
                await bootstrapLockManager.releaseLock();
            }
        } catch (error) {
            console.error('[ipc] system:forceResetLocalDatabase error:', error);
            return { success: false, error: error.message };
        }
    });



ipcMain.handle('system:chooseDirectory', async (event, payload) => {
    try {
        return await chooseDirectory(payload?.title, payload?.defaultPath);
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});

ipcMain.handle('system:saveBackupSettings', async (event, payload) => {
    try {
        return await saveBackupSettings(payload || {});
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:testDatabaseConnection', async (event, payload) => {
    try {
        return await testDatabaseConnectionSettings(payload || {});
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:saveDatabaseConnection', async (event, payload) => {
    try {
        return await configureDatabaseConnection(payload || {});
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:resetDatabaseConnection', async () => {
    try {
        return await resetDatabaseConnectionState();
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});

ipcMain.handle('system:completeFirstRunSetup', async (event, payload) => {
    try {
        const onProgress = (message, percent) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('system:setupProgress', { message, percent });
            }
        };
        return await completeFirstRunSetup(payload || {}, onProgress);
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:backupDatabase', async (event, payload) => {
    try {
        const result = await backupDatabase({ app, dialog, options: payload || {} });
        if (result?.success) {
            await logSystemAudit({
                action: 'SYSTEM_DATABASE_BACKUP',
                entityType: 'DatabaseMaintenance',
                note: 'Create database backup',
                after: result
            });
        }
        return result;
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:restoreDatabase', async () => {
    try {
        const result = await restoreDatabase({ app, dialog, dbService });
        if (result?.success) {
            await logSystemAudit({
                action: 'SYSTEM_DATABASE_RESTORE',
                entityType: 'DatabaseMaintenance',
                note: 'Restore database backup',
                after: result
            });
        }
        return result;
    } catch (error) {
        return { error: error?.message || String(error) };
    }
});
ipcMain.handle('system:restartApp', async () => {
    await logSystemAudit({
        action: 'SYSTEM_APP_RESTART',
        entityType: 'Application',
        note: 'Restart application'
    });
    app.relaunch();
    setImmediate(() => app.exit(0));
    return { success: true };
});

ipcMain.handle('app:confirm-exit', async (event, choice) => {
    try {
        if (choice === 'quit') {
            await logoutAndQuitApplication();
            return { success: true };
        }

        if (choice === 'backup') {
            const backupResult = await backupFromClosePrompt();
            return backupResult;
        }

        return { success: true, cancelled: true };
    } catch (error) {
        console.error('[exit] Error handling confirm-exit:', error);
        return { error: error?.message || String(error) };
    }
});

// ── Print IPC Handlers ───────────────────────────────────────────────────────
ipcMain.handle('print:listPrinters', async (event) => {
    try {
        const webContents = event.sender;
        if (typeof webContents.getPrintersAsync === 'function') {
            return await webContents.getPrintersAsync();
        }
        if (typeof webContents.getPrinters === 'function') {
            return webContents.getPrinters();
        }
        return [];
    } catch (error) {
        console.error('[print] Failed to list printers:', error);
        return [];
    }
});

const handlePrintHtml = async (event, options) => {
    return new Promise(async (resolve) => {
        let printWindow = null;
        try {
            const html = options?.html || '';
            const requestedPrinterName = String(options?.printerName || '').trim();
            const isSilent = options?.silent !== false;

            printWindow = new BrowserWindow({ 
                show: false, 
                webPreferences: { nodeIntegration: false } 
            });

            printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

            printWindow.webContents.on('did-finish-load', () => {
                const printOptions = {
                    silent: isSilent,
                    printBackground: true,
                    margins: { marginType: 'none' },
                    pageSize: options?.pageSize || { width: 80000, height: 297000 },
                    ...(options?.printOptions || {})
                };

                if (requestedPrinterName) {
                    printOptions.deviceName = requestedPrinterName;
                }


                printWindow.webContents.print(printOptions, (success, failureReason) => {
                    if (printWindow) printWindow.close();
                    resolve({ success, error: failureReason });
                });
            });

            printWindow.webContents.on('did-fail-load', (e, code, desc) => {
                if (printWindow) printWindow.close();
                resolve({ success: false, error: `فشل تحميل المحتوى: ${desc}` });
            });
        } catch (error) {
            if (printWindow) printWindow.close();
            resolve({ success: false, error: String(error) });
        }
    });
};

ipcMain.handle('print:printHTML', handlePrintHtml);

ipcMain.handle('print:silentPrint', async (event, options) => {
    return new Promise((resolve) => {
        const printOptions = {
            silent: true, 
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: options?.pageSize || { width: 80000, height: 297000 },
            ...(options?.printOptions || {})
        };

        if (options?.printerName) {
            printOptions.deviceName = options.printerName;
        }

        event.sender.print(printOptions, (success, error) => {
            resolve({ success, error });
        });
    });
});



const injectPrintPreviewToolbar = (html, title) => {
    const safeTitle = String(title || 'معاينة قبل الطباعة')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const toolbar = `
<style>
  #codex-print-preview-toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: #1e293b; color: white; font-family: Arial, sans-serif;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 10px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.28);
  }
  #codex-print-preview-toolbar strong { font-size: 14px; font-weight: 700; }
  #codex-print-preview-toolbar .codex-print-preview-actions { display: flex; gap: 8px; align-items: center; }
  #codex-print-preview-toolbar button {
    padding: 7px 16px; border: none; border-radius: 6px;
    font-size: 13px; font-weight: 700; cursor: pointer; font-family: Arial, sans-serif;
  }
  #codex-print-preview-toolbar .codex-print-btn { background: #22c55e; color: white; }
  #codex-print-preview-toolbar .codex-close-btn { background: #ef4444; color: white; }
  #print-status { font-size: 13px; display: none; margin-left: 10px; }
  @media screen { body { padding-top: 54px !important; } }
  @media print { #codex-print-preview-toolbar { display: none !important; } body { padding-top: 0 !important; } }
</style>
<div id="codex-print-preview-toolbar">
  <strong>${safeTitle}</strong>
  <div class="codex-print-preview-actions">
    <span id="print-status"></span>
    <button class="codex-print-btn" id="btn-print" onclick="handlePrint()">طباعة</button>
    <button class="codex-close-btn" onclick="window.close()">إغلاق</button>
  </div>
</div>
<script>
  async function handlePrint() {
    var btn = document.getElementById('btn-print');
    var status = document.getElementById('print-status');
    btn.disabled = true;
    btn.textContent = 'جاري الطباعة...';
    status.style.display = 'inline';
    status.textContent = '';
    try {
      var result = await window.previewAPI.print();
      if (result && result.success) {
        status.textContent = '✅ تمت الطباعة';
        status.style.color = '#4ade80';
      } else {
        status.textContent = '❌ ' + (result && result.error ? result.error : 'فشلت الطباعة');
        status.style.color = '#f87171';
      }
    } catch (err) {
      status.textContent = '❌ ' + err.message;
      status.style.color = '#f87171';
    }
    btn.disabled = false;
    btn.textContent = 'طباعة';
  }
</script>`;

    if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body([^>]*)>/i, `<body$1>${toolbar}`);
    }

    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${safeTitle}</title></head><body>${toolbar}${html}</body></html>`;
};

// print:html → opens a visible PREVIEW window with a print button inside
ipcMain.handle('print:html', async (event, options) => {
    return new Promise((resolve) => {
        try {
            const html = options?.html || '';
            const title = options?.title || 'معاينة قبل الطباعة';
            const requestedPrinterName = String(options?.printerName || '').trim();
            const useRawPreview = options?.raw === true;

            // Build a wrapper page with the content + a floating print/close toolbar
            const previewHTML = useRawPreview ? injectPrintPreviewToolbar(html, title) : `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e5e7eb; font-family: Arial, sans-serif; }
  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: #1e293b; color: white;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  #toolbar h1 { font-size: 15px; font-weight: 600; }
  #toolbar .btn-group { display: flex; gap: 10px; align-items: center; }
  #toolbar button {
    padding: 7px 20px; border: none; border-radius: 6px;
    font-size: 14px; font-weight: 600; cursor: pointer; font-family: Arial;
  }
  #btn-print { background: #22c55e; color: white; }
  #btn-print:hover { background: #16a34a; }
  #btn-close { background: #ef4444; color: white; }
  #btn-close:hover { background: #dc2626; }
  .no-print, .print-button { display: none !important; }
  #print-status { font-size: 13px; display: none; margin-left: 10px; }
  #content-wrapper {
    margin-top: 60px; padding: 20px;
    display: flex; justify-content: center;
  }
  #content-frame {
    background: white; width: 100%; max-width: 900px;
    border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 20px;
  }
  @media print {
    #toolbar { display: none !important; }
    #content-wrapper { margin-top: 0; padding: 0; }
    #content-frame { box-shadow: none; border-radius: 0; padding: 0; }
    body { background: white; }
  }
</style>
</head>
<body>
<div id="toolbar">
  <h1>🖨️ ${title}</h1>
  <div class="btn-group">
    <span id="print-status"></span>
    <button id="btn-print" onclick="handlePrint()">طباعة</button>
    <button id="btn-close" onclick="window.close()">إغلاق</button>
  </div>
</div>
<div id="content-wrapper">
  <div id="content-frame">${html}</div>
</div>
<script>
  async function handlePrint() {
    var btn = document.getElementById('btn-print');
    var status = document.getElementById('print-status');
    btn.disabled = true;
    btn.textContent = 'جاري الطباعة...';
    status.style.display = 'inline';
    status.textContent = '';
    try {
      if (!window.previewAPI) {
        throw new Error('فشل تحميل واجهة الطباعة (Preload Script Missing)');
      }
      var result = await window.previewAPI.print();
      if (result && result.success) {
        status.textContent = '✅ تمت الطباعة';
        status.style.color = '#4ade80';
      } else {
        status.textContent = '❌ ' + (result && result.error ? result.error : 'فشلت الطباعة');
        status.style.color = '#f87171';
      }
    } catch (err) {
      status.textContent = '❌ ' + err.message;
      status.style.color = '#f87171';
    }
    btn.disabled = false;
    btn.textContent = 'طباعة';
  }
</script>
</body>
</html>`;

            const previewWindow = new BrowserWindow({
                width: 960,
                height: 800,
                title,
                show: true,
                webPreferences: { 
                    nodeIntegration: false, 
                    contextIsolation: true, 
                    preload: path.join(__dirname, 'preview-preload.js') 
                }
            });

            const doPrintHandler = async () => {
                return new Promise((printResolve) => {
                    const printOptions = {
                        silent: true,
                        printBackground: true,
                        margins: { marginType: 'none' }
                    };
                    if (requestedPrinterName) {
                        printOptions.deviceName = requestedPrinterName;
                    }
                    previewWindow.webContents.print(printOptions, (success, failureReason) => {
                        printResolve({ success, error: failureReason || '' });
                    });
                });
            };
            
            ipcMain.removeHandler('preview:doPrint'); 
            ipcMain.handle('preview:doPrint', doPrintHandler);

            previewWindow.setMenuBarVisibility(false);
            previewWindow.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`
            );

            previewWindow.on('closed', () => {
                ipcMain.removeHandler('preview:doPrint');
                resolve({ success: true, previewClosed: true });
            });
        } catch (error) {
            resolve({ success: false, error: String(error) });
        }
    });
});

ipcMain.handle('print:sale', async (event, saleId, companyInfo) => {
    // Basic fallback for print:sale until custom receipt logic is built
    return { success: false, error: 'Custom receipt printing is not fully implemented yet in the backend.' };
});

ipcMain.handle('print:exportPDF', async (event, options) => {
    try {
        const html = options?.html || '';
        const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdfData = await printWindow.webContents.printToPDF({});
        printWindow.close();
        
        const { filePath } = await dialog.showSaveDialog({
            title: 'حفظ كملف PDF',
            defaultPath: 'document.pdf',
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        
        if (filePath) {
            require('fs').writeFileSync(filePath, pdfData);
            return { success: true, filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        console.error('[print] Failed to export PDF:', error);
        return { success: false, error: String(error) };
    }
});

// Note: Database IPC handlers are registered dynamically after dbService initialization
// See database-ipc-handlers.js for all db: IPC handlers

const reconcileVariantInventoryStocksOnStartup = async () => {
    if (!dbService) return;
    try {
        const result = await dbService.reconcileVariantInventoryStocks();
        if (result?.error) {
            console.warn('[startup] Failed to reconcile variant inventory stocks:', result.error);
            return;
        }

        if ((result?.processed || 0) > 0) {
            console.log(
                `[startup] Reconciled variant inventory stocks: ${result.synced}/${result.processed} succeeded, ${result.failed} failed`
            );
        }
    } catch (error) {
        console.warn('[startup] Failed to reconcile variant inventory stocks:', error?.message || error);
    }
};

app.whenReady().then(() => {
    return (async () => {
        const systemConfig = await readSystemConfig(app);
        const storedDatabase = normalizeDatabaseConfig(systemConfig?.database);
        const parsedDatabaseConfig = parseDatabaseConfig();

        if (storedDatabase.configured) {
            await applyStoredDatabaseEnv(systemConfig);
        }

        databaseRuntimeState = {
            ...databaseRuntimeState,
            configured: storedDatabase.configured || Boolean(parsedDatabaseConfig),
            mode: normalizeDatabaseMode(
                storedDatabase.mode
                || (parsedDatabaseConfig && !isLocalHostValue(parsedDatabaseConfig.host)
                    ? 'remote_client'
                    : 'local_server')
            )
        };

        if (!storedDatabase.configured && !systemConfig?.setupCompleted) {
            createWindow();
            registerActivateWindowHandler();
            setupAutoUpdater(mainWindow);
            return;
        }

        // ✅ للمحلي: تأكد من استخدام database.runtime.env إذا وُجد
        if (storedDatabase.mode === 'local_server' || !storedDatabase.mode || storedDatabase.mode === '') {
            const userRuntimeEnvPath = getUserRuntimeEnvPath(app);
            if (fs.existsSync(userRuntimeEnvPath)) {
                try {
                    const runtimeParsed = dotenv.parse(fs.readFileSync(userRuntimeEnvPath, 'utf8'));
                    if (runtimeParsed?.DATABASE_URL) {
                        process.env.DATABASE_URL = runtimeParsed.DATABASE_URL;
                        console.log('[startup] Loaded DATABASE_URL from database.runtime.env');
                    }
                } catch (err) {
                    console.warn('[startup] Failed to read database.runtime.env:', err?.message);
                }
            }
        }

        // Create main window BEFORE bootstrap to allow status window to work
        createWindow();
        registerActivateWindowHandler();
        setupAutoUpdater(mainWindow);

        const bootstrapResult = await ensureDatabaseLayerReady();

        if (!bootstrapResult?.ok) {
            databaseRuntimeState = {
                ...databaseRuntimeState,
                ready: false,
                error: bootstrapResult?.error?.message || 'تعذر الاتصال بقاعدة البيانات.'
            };
            return;
        }

        await refreshBackupAutomation();

        void reconcileVariantInventoryStocksOnStartup();
        void (async () => {
            const config = await readSystemConfig(app);
            if (config.backupSettings?.autoBackupOnOpen) {
                await runAutomatedBackup('startup', false).catch(() => {});
            }
            if (config.secondaryBackupSettings?.enabled && config.secondaryBackupSettings?.autoBackupOnOpen) {
                await runAutomatedBackup('startup', true).catch(() => {});
            }
        })();
    })().catch(async (error) => {
        console.error('[startup] Application bootstrap failed:', error);
        databaseRuntimeState = {
            ...databaseRuntimeState,
            ready: false,
            error: error?.message || String(error)
        };
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
            registerActivateWindowHandler();
        }
        return;
    });
})

app.on('before-quit', (event) => {
    if (allowQuitAfterBackup) {
        return;
    }

    event.preventDefault();
    clearBackupAutomationTimer();

    if (shutdownBackupPending) {
        return;
    }

    shutdownBackupPending = true;

    void (async () => {
        try {
            // Cleanup WhatsApp service
            try {
                const { getWhatsAppService } = require('./whatsapp-service');
                await getWhatsAppService().destroy();
            } catch { /* ignore */ }

            const config = await readSystemConfig(app);
            if (config.backupSettings?.autoBackupOnClose) {
                await runAutomatedBackup('shutdown', false).catch(() => {});
            }
            if (config.secondaryBackupSettings?.enabled && config.secondaryBackupSettings?.autoBackupOnClose) {
                await runAutomatedBackup('shutdown', true).catch(() => {});
            }
        } finally {
            shutdownBackupPending = false;
            allowQuitAfterBackup = true;
            app.quit();
        }
    })();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

/**
 * postgres-bootstrap.js — PostgreSQL Bootstrap
 *
 * تدفق بسيط:
 * 1. حاول الاتصال مباشرة → لو نجح → شغّل المهاجرات → خلاص
 * 2. ابحث عن service خاص بالبرنامج → شغّله لو واقف
 * 3. ملقاش service → ثبّت PostgreSQL من الملف المضمن
 * 4. أنشئ المستخدم وقاعدة البيانات
 * 5. شغّل Prisma migrations
 * 6. خلاص ✅
 */

const fs = require('fs');
const fsp = require('fs/promises');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');
const { PrismaClient } = require('@prisma/client');
const { applyPackagedPrismaEngineEnv, resolvePackagedPrismaEngineEnv } = require('./prisma-engine-paths');

// ── الثوابت ─────────────────────────────────────────────────────────────────

const DEFAULT_POSTGRES_PORT = 5433;
const DEFAULT_SUPERUSER = 'postgres';
const DEFAULT_SUPER_PASSWORD = 'StrongPass123!';
const DEFAULT_SERVICE_NAME = 'postgresql-erp-16';
const DEFAULT_INSTALLER_FILE = 'postgresql-16.4-1-windows-x64.exe';

/**
 * يحدد المسار الافتراضي لتخزين بيانات قاعدة البيانات.
 * يتم وضع البيانات في مجلد "database" داخل مجلد تثبيت البرنامج
 * بدلاً من AppData على الـ C لحماية البيانات عند إعادة تنزيل الويندوز.
 */
const getDefaultDataDir = (appInstance) => {
    try {
        // في البيئة المعبأة: مسار الملف التنفيذي (exe)
        // في بيئة التطوير: مسار المشروع
        const baseDir = appInstance.isPackaged
            ? path.dirname(appInstance.getPath('exe'))
            : appInstance.getAppPath();
        return path.join(baseDir, 'database');
    } catch (err) {
        console.warn('[postgres] تعذر تحديد مسار التثبيت، استخدام AppData:', err?.message);
        try {
            return path.join(appInstance.getPath('userData'), 'database');
        } catch {
            return '';
        }
    }
};

// أسماء الـ services الخاصة بالبرنامج فقط
const OUR_SERVICE_NAMES = [
    'postgresql-erp-16',
    'postgresql-erp-17',
];

// ── مساعدات ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quoteIdentifier = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const quoteLiteral = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const isLocalHost = (h) => ['localhost', '127.0.0.1', '::1'].includes(String(h || '').trim().toLowerCase());

applyPackagedPrismaEngineEnv(process.env);

const resolveProjectRoot = () => path.join(__dirname, '..');

// ── تشغيل أوامر ─────────────────────────────────────────────────────────────

const runProcess = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        windowsHide: true,
        shell: false,
        ...options
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    const timeoutMs = Number(options.timeoutMs || 0);
    let timer = null;

    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            child.kill();
            reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        }, timeoutMs);
    }

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.once('error', (error) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        reject(error);
    });

    child.once('close', (code) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (code === 0) {
            resolve({ stdout, stderr, code });
            return;
        }
        const error = new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
    });
});

// ── الشبكة ───────────────────────────────────────────────────────────────────

const isPortOpen = (host, port, timeoutMs = 1500) => new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(value);
    };
    socket.setTimeout(timeoutMs);
    // Force IPv4 for localhost to avoid Electron/Node dns resolution hangs or timeout issues
    const targetHost = host === 'localhost' ? '127.0.0.1' : host;
    
    const logPath = require('path').join(require('os').tmpdir(), 'bootstrap_port_debug.log');
    
    socket.once('connect', () => {
        require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] connect success to ${targetHost}:${port}\n`);
        finish(true);
    });
    socket.once('timeout', () => {
        require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] timeout on ${targetHost}:${port}\n`);
        finish(false);
    });
    socket.once('error', (err) => {
        require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] error on ${targetHost}:${port}: ${err.message}\n`);
        finish(false);
    });

    socket.connect(port, targetHost);
});

const waitForPort = async (host, port, timeoutMs = 180000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(host, port)) return true;
        await sleep(2000);
    }
    return false;
};

// ── الإعدادات ────────────────────────────────────────────────────────────────

const buildConnectionUrl = ({ user, password, host, port, database }) =>
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password || '')}@${host}:${port}/${database}`;

const parseDatabaseConfig = () => {
    const rawUrl = String(process.env.DATABASE_URL || '').trim();
    if (!rawUrl) return null;

    try {
        const parsed = new URL(rawUrl);
        const protocol = parsed.protocol.toLowerCase();
        if (protocol !== 'postgresql:' && protocol !== 'postgres:') return null;

        const appUser = decodeURIComponent(parsed.username || '').trim();
        const databaseName = String(parsed.pathname || '').replace(/^\/+/, '').trim();
        if (!appUser || !databaseName) return null;

        return {
            rawUrl,
            host: parsed.hostname || 'localhost',
            port: Number(parsed.port || DEFAULT_POSTGRES_PORT),
            databaseName,
            appUser,
            appPassword: decodeURIComponent(parsed.password || ''),
            superUser: String(process.env.ERP_PG_SUPER_USER || DEFAULT_SUPERUSER).trim(),
            superPassword: String(process.env.ERP_PG_SUPER_PASSWORD || DEFAULT_SUPER_PASSWORD).trim(),
            serviceName: String(process.env.ERP_PG_SERVICE_NAME || DEFAULT_SERVICE_NAME).trim(),
            installerFileName: String(process.env.ERP_PG_INSTALLER_FILE || DEFAULT_INSTALLER_FILE).trim(),
            installDir: String(process.env.ERP_PG_INSTALL_DIR || '').trim(),
            dataDir: String(process.env.ERP_PG_DATA_DIR || '').trim(),
            serverMode: String(process.env.ERP_PG_SERVER_MODE || '').trim()
        };
    } catch {
        return null;
    }
};

// ── اختبار الاتصال ──────────────────────────────────────────────────────────

const testPrismaConnection = async (url) => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
        await prisma.$connect();
        await prisma.$queryRawUnsafe('SELECT 1');
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            code: String(error?.code || '').trim(),
            message: error?.message || String(error)
        };
    } finally {
        await prisma.$disconnect().catch(() => {});
    }
};

// ── ملف Runtime Env ──────────────────────────────────────────────────────────

const getUserRuntimeEnvPath = (appInstance) =>
    path.join(appInstance.getPath('userData'), 'database.runtime.env');

const persistRuntimeDatabaseEnv = async (appInstance, config) => {
    const envPath = getUserRuntimeEnvPath(appInstance);
    const content = [
        `DATABASE_URL="${config.rawUrl}"`,
        `ERP_PG_PORT="${config.port}"`,
        `ERP_PG_SERVICE_NAME="${config.serviceName || DEFAULT_SERVICE_NAME}"`,
        `ERP_PG_SUPER_USER="${config.superUser || DEFAULT_SUPERUSER}"`,
        `ERP_PG_SUPER_PASSWORD="${config.superPassword || DEFAULT_SUPER_PASSWORD}"`,
        `ERP_DB_NAME="${config.databaseName}"`,
        `ERP_DB_USER="${config.appUser}"`,
        `ERP_DB_PASSWORD="${config.appPassword || ''}"`,
        `ERP_PG_DATA_DIR="${config.dataDir || ''}"`
    ].join('\n') + '\n';
    await fsp.mkdir(path.dirname(envPath), { recursive: true });
    await fsp.writeFile(envPath, content, 'utf8');
    console.log('[postgres] حُفظ runtime env:', envPath);
};

// ── البحث عن PostgreSQL ─────────────────────────────────────────────────────

const findPostgresBinDir = (config = {}) => {
    const candidates = [];

    if (config.installDir) {
        candidates.push(path.join(config.installDir, 'bin'));
    }

    // بحث في Program Files
    const programRoots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
        .map(v => String(v || '').trim()).filter(Boolean);
    for (const root of programRoots) {
        const baseDir = path.join(root, 'PostgreSQL');
        if (!fs.existsSync(baseDir)) continue;
        try {
            const versions = fs.readdirSync(baseDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name)
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            for (const ver of versions) {
                candidates.push(path.join(baseDir, ver, 'bin'));
            }
        } catch { /* ignore */ }
    }

    // بحث في PATH
    const whereResult = spawnSync('where.exe', ['psql.exe'], { encoding: 'utf8', windowsHide: true });
    if (whereResult.status === 0) {
        for (const line of String(whereResult.stdout || '').split(/\r?\n/).filter(Boolean)) {
            candidates.push(path.dirname(line.trim()));
        }
    }

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'psql.exe'))) {
            return candidate;
        }
    }
    return null;
};

// ── إدارة الـ Services ───────────────────────────────────────────────────────

const queryService = async (serviceName) => {
    try {
        const result = await runProcess('sc.exe', ['query', serviceName], { timeoutMs: 10000 });
        const output = `${result.stdout}\n${result.stderr}`;
        return {
            exists: true,
            isRunning: /STATE\s*:\s*\d+\s+RUNNING/i.test(output)
        };
    } catch {
        return { exists: false, isRunning: false };
    }
};

/**
 * يبحث فقط عن services خاصة بالبرنامج (مش أي PostgreSQL على الجهاز)
 */
const findOurPostgresService = async (preferredName) => {
    // 1) الاسم المفضل أولاً
    if (preferredName) {
        const info = await queryService(preferredName);
        if (info.exists) return { name: preferredName, ...info };
    }

    // 2) أسماء البرنامج المعروفة فقط
    for (const name of OUR_SERVICE_NAMES) {
        if (name === preferredName) continue; // تم فحصه بالفعل
        const info = await queryService(name);
        if (info.exists) return { name, ...info };
    }

    return null;
};

const startService = async (serviceName) => {
    console.log(`[postgres] تشغيل service: ${serviceName}`);
    try {
        await runProcess('sc.exe', ['start', serviceName], { timeoutMs: 30000 });
    } catch (error) {
        const text = `${error?.stdout || ''}\n${error?.stderr || ''}\n${error?.message || ''}`;
        if (/1056|already been started/i.test(text)) return;
        try {
            await runProcess('net', ['start', serviceName], { timeoutMs: 30000 });
        } catch {
            throw error;
        }
    }
};

/**
 * يستخرج مسار مجلد البيانات (Data Directory) الحقيقي من إعدادات الخدمة في ويندوز
 */
const getServiceDataDir = async (serviceName) => {
    try {
        const { stdout } = await runProcess('sc.exe', ['qc', serviceName], { timeoutMs: 5000 });
        // نبحث عن معامل -D الذي يتبعه المسار
        const match = stdout.match(/-D\s+("[^"]+"|[^\s]+)/i);
        if (match) {
            return match[1].replace(/"/g, '').trim();
        }
    } catch (e) {
        console.warn(`[postgres] تعذر جلب مسار البيانات للخدمة ${serviceName}:`, e.message);
    }
    return null;
};


// ── تثبيت PostgreSQL ─────────────────────────────────────────────────────────

const resolveInstallerPath = (config, appInstance) => {
    const fileName = config.installerFileName || DEFAULT_INSTALLER_FILE;
    const candidates = [
        path.join(resolveProjectRoot(), 'vendor', fileName),
        path.join(process.resourcesPath || '', 'vendor', fileName),
        path.join(path.dirname(appInstance?.getPath?.('exe') || process.execPath), fileName)
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
};

const quoteWindowsArg = (value) => {
    const raw = String(value ?? '');
    if (!/[\s"]/u.test(raw)) return raw;
    let escaped = '"';
    let backslashes = 0;
    for (const ch of raw) {
        if (ch === '\\') { backslashes++; continue; }
        if (ch === '"') { escaped += '\\'.repeat((backslashes * 2) + 1) + '"'; backslashes = 0; continue; }
        if (backslashes > 0) { escaped += '\\'.repeat(backslashes); backslashes = 0; }
        escaped += ch;
    }
    if (backslashes > 0) escaped += '\\'.repeat(backslashes * 2);
    escaped += '"';
    return escaped;
};

const quotePsLiteral = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

const buildElevatedPsScript = (installerPath, args) => {
    const argLine = args.map(a => quoteWindowsArg(a)).join(' ');
    return [
        "$ErrorActionPreference = 'Stop'",
        `$installerPath = ${quotePsLiteral(installerPath)}`,
        `$argumentLine = ${quotePsLiteral(argLine)}`,
        'try {',
        '  $process = Start-Process -FilePath $installerPath -ArgumentList $argumentLine -Verb RunAs -Wait -PassThru',
        '  exit ([int]$process.ExitCode)',
        '} catch {',
        '  if ($_.Exception.Message) { [Console]::Error.WriteLine($_.Exception.Message) }',
        '  exit 1',
        '}'
    ].join('\n');
};

const installPostgreSQL = async (installerPath, config, onProgress) => {
    onProgress?.('جاري تثبيت PostgreSQL... قد يستغرق 5-10 دقائق', 20);

    const args = [
        '--mode', 'unattended',
        '--unattendedmodeui', 'minimal',
        '--superaccount', config.superUser,
        '--superpassword', config.superPassword,
        '--servicename', config.serviceName,
        '--serverport', String(config.port),
        '--enable-components', 'server,commandlinetools',
        '--disable-components', 'pgAdmin,stackbuilder',
        '--create_shortcuts', '0',
        '--enable_acledit', '1'
    ];

    if (config.installDir) args.push('--prefix', config.installDir);
    if (config.dataDir) args.push('--datadir', config.dataDir);

    const script = buildElevatedPsScript(installerPath, args);
    const encodedCmd = Buffer.from(script, 'utf16le').toString('base64');

    try {
        await runProcess('powershell.exe', [
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-OutputFormat', 'Text', '-EncodedCommand', encodedCmd
        ], { timeoutMs: 30 * 60 * 1000 });
    } catch (error) {
        const code = Number(error?.code || 0);
        if (code !== 3010 && code !== 1641) {
            throw new Error(`فشل تثبيت PostgreSQL: ${error?.message || 'خطأ غير معروف'}`);
        }
        // 3010/1641 = تم التثبيت لكن قد يحتاج إعادة تشغيل
    }

    onProgress?.('جاري تسجيل خدمة PostgreSQL...', 40);

    // انتظر حتى يظهر الـ service
    for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const svc = await queryService(config.serviceName);
        if (svc.exists) {
            return config.serviceName;
        }
        // ممكن المثبت سجّل بإسم تاني
        const any = await findOurPostgresService(config.serviceName);
        if (any) {
            return any.name;
        }
    }

    throw new Error('تم التثبيت لكن لم يتم تسجيل الخدمة. حاول إعادة تشغيل الجهاز.');
};

// ── إنشاء المستخدم وقاعدة البيانات ──────────────────────────────────────────

const runPsql = async ({ psqlPath, config, database = 'postgres', sql, quiet = false }) => {
    const args = ['-h', config.host, '-p', String(config.port), '-U', config.superUser, '-d', database, '-v', 'ON_ERROR_STOP=1'];
    if (quiet) args.push('-tA');
    args.push('-c', sql);
    return runProcess(psqlPath, args, {
        env: { ...process.env, PGPASSWORD: config.superPassword },
        timeoutMs: 30000
    });
};

const ensureDatabaseAndRole = async (config) => {
    const binDir = findPostgresBinDir(config);
    if (!binDir) {
        throw new Error('لم يتم العثور على psql.exe. تأكد من تثبيت PostgreSQL بنجاح.');
    }
    const psqlPath = path.join(binDir, 'psql.exe');

    // أولاً: اختبر اتصال psql كـ superuser
    try {
        await runPsql({ psqlPath, config, sql: 'SELECT 1;', quiet: true });
    } catch (error) {
        throw new Error(`فشل الاتصال بـ PostgreSQL كمدير: ${error?.message || error}. تأكد من صحة كلمة مرور PostgreSQL.`);
    }

    // إنشاء المستخدم
    const roleSql = [
        'DO $block$', 'BEGIN',
        `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(config.appUser)}) THEN`,
        `    CREATE ROLE ${quoteIdentifier(config.appUser)} LOGIN PASSWORD ${quoteLiteral(config.appPassword)};`,
        '  ELSE',
        `    ALTER ROLE ${quoteIdentifier(config.appUser)} WITH LOGIN PASSWORD ${quoteLiteral(config.appPassword)};`,
        '  END IF;', 'END', '$block$;'
    ].join('\n');
    await runPsql({ psqlPath, config, sql: roleSql });

    // إنشاء قاعدة البيانات
    const dbCheck = await runPsql({
        psqlPath, config, quiet: true,
        sql: `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(config.databaseName)};`
    });
    const dbExists = String(dbCheck.stdout || '').trim() === '1';

    if (!dbExists) {
        await runPsql({
            psqlPath, config,
            sql: `CREATE DATABASE ${quoteIdentifier(config.databaseName)} OWNER ${quoteIdentifier(config.appUser)};`
        });
    } else {
        await runPsql({
            psqlPath, config,
            sql: `ALTER DATABASE ${quoteIdentifier(config.databaseName)} OWNER TO ${quoteIdentifier(config.appUser)};`
        });
    }

    await runPsql({
        psqlPath, config, database: config.databaseName,
        sql: `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(config.databaseName)} TO ${quoteIdentifier(config.appUser)};`
    });

    console.log(`[postgres] ✅ قاعدة البيانات "${config.databaseName}" والمستخدم "${config.appUser}" جاهزين`);
};

/**
 * يقوم بحذف قاعدة البيانات نهائياً دون إعادة إنشائها.
 */
const dropDatabaseOnly = async (config) => {
    const binDir = findPostgresBinDir(config);
    if (!binDir) throw new Error('لم يتم العثور على psql.exe');
    const psqlPath = path.join(binDir, 'psql.exe');

    console.log(`[postgres] ⚠️ جاري حذف قاعدة البيانات "${config.databaseName}" نهائياً...`);

    // 1. إنهاء كافة الاتصالات بقاعدة البيانات ليسمح بالحذف
    const terminateSql = `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = ${quoteLiteral(config.databaseName)}
          AND pid <> pg_backend_pid();
    `;
    
    // نحاول قطع الاتصالات عدة مرات للتغلب على إعادة اتصال الأدوات مثل pgAdmin
    for (let i = 0; i < 3; i++) {
        await runPsql({ psqlPath, config, sql: terminateSql }).catch(() => {});
        await sleep(500);
    }

    // 2. حذف قاعدة البيانات
    await runPsql({
        psqlPath, config,
        sql: `DROP DATABASE IF EXISTS ${quoteIdentifier(config.databaseName)};`
    }).catch((err) => {
        console.error(`[postgres] فشل حذف قاعدة البيانات: ${err.message}`);
        throw err;
    });
};

/**
 * يقوم بحذف قاعدة البيانات وإعادة إنشائها بالكامل.
 * يُستخدم في حالات الطوارئ أو عند وجود تعارض في Migrations (P3009).
 */
const dropAndRecreateDatabase = async (config) => {
    await dropDatabaseOnly(config).catch(() => {});
    await ensureDatabaseAndRole(config);
};


// ── Prisma Migrations ────────────────────────────────────────────────────────

const buildNodePathValue = (...groups) => groups
    .flat()
    .map(e => String(e || '').trim())
    .filter(Boolean)
    .filter((e, i, arr) => arr.indexOf(e) === i)
    .join(path.delimiter);

const resolveRuntimeNodeModulePaths = () => {
    const paths = [];
    if (process.resourcesPath) {
        paths.push(path.join(process.resourcesPath, 'node_modules'));
        paths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'));
        paths.push(path.join(process.resourcesPath, 'app.asar', 'node_modules'));
    }
    paths.push(path.join(resolveProjectRoot(), 'node_modules'));
    return paths.filter(p => p.includes('app.asar') || fs.existsSync(p));
};

const nodeChildEnv = () => ({
    ...process.env,
    ...resolvePackagedPrismaEngineEnv(),
    NODE_PATH: buildNodePathValue(resolveRuntimeNodeModulePaths(), String(process.env.NODE_PATH || '').split(path.delimiter)),
    ELECTRON_RUN_AS_NODE: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    PRISMA_DISABLE_WARNINGS: '1'
});

const resolveSchemaPath = (isPackaged) =>
    isPackaged
        ? path.join(process.resourcesPath, 'prisma', 'schema.prisma')
        : path.join(resolveProjectRoot(), 'prisma', 'schema.prisma');

const resolvePrismaCliPath = () => {
    const p = require.resolve('prisma/build/index.js');
    return p.includes('app.asar') ? p.replace('app.asar', 'app.asar.unpacked') : p;
};

const resolveBootstrapScriptPath = (isPackaged) =>
    isPackaged
        ? path.join(process.resourcesPath, 'prisma', 'bootstrap.js')
        : path.join(resolveProjectRoot(), 'prisma', 'bootstrap.js');

const runNodeScript = async (scriptPath, args, { cwd, env }) => runProcess(
    process.execPath, [scriptPath, ...args],
    { cwd, env: { ...nodeChildEnv(), ...env }, timeoutMs: 10 * 60 * 1000 }
);

const withTmpDir = async (prefix, fn) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
    try { return await fn(dir); }
    finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
};

const runPrismaMigrateDeploy = async (config, isPackaged) => {
    const cliPath = resolvePrismaCliPath();
    const schemaPath = resolveSchemaPath(isPackaged);
    await withTmpDir('erp-prisma-migrate-', (cwd) =>
        runNodeScript(cliPath, ['migrate', 'deploy', '--schema', schemaPath], {
            cwd, env: { DATABASE_URL: config.rawUrl }
        })
    );
};

const runInitialBootstrap = async (config, isPackaged) => {
    const scriptPath = resolveBootstrapScriptPath(isPackaged);
    if (!fs.existsSync(scriptPath)) return null;
    try {
        const result = await withTmpDir('erp-prisma-bootstrap-', (cwd) =>
            runNodeScript(scriptPath, [], { cwd, env: { DATABASE_URL: config.rawUrl } })
        );
        const lastLine = String(result.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop();
        return lastLine ? JSON.parse(lastLine) : null;
    } catch {
        return null;
    }
};

const enableRemoteConnections = async (dataDir) => {
    try {
        const confPath = path.join(dataDir, 'postgresql.conf');
        const hbaPath = path.join(dataDir, 'pg_hba.conf');

        if (fs.existsSync(confPath)) {
            let conf = await fsp.readFile(confPath, 'utf8');
            if (!conf.includes("listen_addresses = '*'")) {
                conf += "\nlisten_addresses = '*'\n";
                await fsp.writeFile(confPath, conf, 'utf8');
                console.log('[postgres] Enabled listen_addresses = * in postgresql.conf');
            }
        }

        if (fs.existsSync(hbaPath)) {
            let hba = await fsp.readFile(hbaPath, 'utf8');
            if (!hba.includes('0.0.0.0/0')) {
                hba += "\nhost    all             all             0.0.0.0/0               md5\n";
                await fsp.writeFile(hbaPath, hba, 'utf8');
                console.log('[postgres] Added 0.0.0.0/0 to pg_hba.conf');
            }
        }
    } catch (err) {
        console.warn('[postgres] Failed to enable remote connections:', err.message);
    }
};

// ── النقطة الرئيسية ─────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {Electron.App} options.app
 * @param {typeof BrowserWindow} options.BrowserWindow
 * @param {Electron.Dialog} options.dialog
 * @param {boolean} options.isPackaged
 * @param {(message: string, percent: number) => void} [options.onProgress] - callback لإرسال حالة التقدم
 */
const ensurePostgresDatabaseReady = async ({ app: appInstance, BrowserWindow, dialog, isPackaged, onProgress }) => {
    const progress = (msg, pct) => {
        console.log(`[postgres] [${pct}%] ${msg}`);
        onProgress?.(msg, pct);
    };

    const config = parseDatabaseConfig();
    if (!config) {
        console.log('[postgres] لا يوجد DATABASE_URL، تم التخطي');
        return { ok: true, skipped: true };
    }

    // ── تحديد مسار تخزين بيانات PostgreSQL في مجلد تثبيت البرنامج ──────────
    // هذا يحمي البيانات من الحذف عند إعادة تنزيل الويندوز
    if (!config.dataDir && appInstance) {
        try {
            config.dataDir = getDefaultDataDir(appInstance);
            console.log(`[postgres] مسار تخزين البيانات: ${config.dataDir}`);
        } catch (err) {
            console.warn('[postgres] تعذر تحديد مسار تخزين البيانات:', err?.message);
        }
    }

    progress('جاري فحص الاتصال بقاعدة البيانات...', 5);
    console.log(`[postgres] الهدف: ${config.databaseName}@${config.host}:${config.port}`);

    // ── الخطوة 1: حاول الاتصال المباشر ──────────────────────────────────────
    const firstTest = await testPrismaConnection(config.rawUrl);
    if (firstTest.ok) {
        progress('متصل بقاعدة البيانات. جاري تحديث الجداول...', 70);
        await runPrismaMigrateDeploy(config, isPackaged);
        progress('جاري تجهيز البيانات الأولية...', 85);
        await runInitialBootstrap(config, isPackaged);
        progress('تم الاتصال بنجاح!', 100);
        return { ok: true };
    }

    console.log(`[postgres] فشل الاتصال: ${firstTest.message}`);

    // ── الخطوة 2: لو سيرفر خارجي — لا يمكن الإصلاح التلقائي ────────────────
    if (!isLocalHost(config.host)) {
        const msg = 'تعذر الاتصال بقاعدة البيانات على السيرفر المحدد. تأكد من أن السيرفر يعمل وأن البيانات صحيحة.';
        if (dialog) {
            await dialog.showMessageBox({ type: 'error', title: 'خطأ في الاتصال', message: msg });
        }
        return { ok: false, error: new Error(msg) };
    }

    // ── الخطوة 3: ابحث عن service خاص بالبرنامج فقط ─────────────────────────
    progress('جاري البحث عن PostgreSQL...', 10);
    let serviceName = config.serviceName;
    let serviceFound = false;

    const svc = await findOurPostgresService(serviceName);
    if (svc) {
        serviceName = svc.name;
        serviceFound = true;
        console.log(`[postgres] تم العثور على service: ${serviceName}`);
    }

    // ── الخطوة 4: لو مفيش service → ثبّت PostgreSQL ─────────────────────────
    if (!serviceFound) {
        if (!isPackaged) {
            return { ok: false, error: new Error('PostgreSQL غير مثبت. في وضع التطوير، ثبته يدوياً.') };
        }

        progress('جاري تجهيز ملف التثبيت...', 15);

        // تأكد من وجود مجلد تخزين البيانات قبل التثبيت
        if (config.dataDir) {
            try {
                await fsp.mkdir(config.dataDir, { recursive: true });
                console.log(`[postgres] تم إنشاء مجلد البيانات: ${config.dataDir}`);
            } catch (err) {
                console.warn(`[postgres] تعذر إنشاء مجلد البيانات: ${err?.message}`);
            }
        }

        const installerPath = resolveInstallerPath(config, appInstance);
        if (!installerPath) {
            const msg = 'لم يتم العثور على ملف تثبيت PostgreSQL. تأكد من أن ملف التثبيت موجود في مجلد البرنامج.';
            if (dialog) {
                await dialog.showMessageBox({ type: 'error', title: 'خطأ', message: msg });
            }
            return { ok: false, error: new Error(msg) };
        }

        try {
            serviceName = await installPostgreSQL(installerPath, config, progress);
        } catch (error) {
            const msg = `فشل تثبيت PostgreSQL: ${error?.message || 'خطأ غير معروف'}`;
            if (dialog) {
                await dialog.showMessageBox({
                    type: 'error', title: 'فشل التثبيت',
                    message: 'تعذر تثبيت قاعدة البيانات.',
                    detail: `${msg}\n\nالحلول:\n• شغّل البرنامج كمسؤول (Administrator)\n• أغلق برنامج الحماية مؤقتاً\n• أعد تشغيل الجهاز وحاول مرة أخرى`
                });
            }
            return { ok: false, error };
        }
    }

    // ── الخطوة 5: شغّل الـ service لو واقف ──────────────────────────────────
    if (config.serverMode === 'server' && config.dataDir) {
        progress('جاري تفعيل الاتصالات البعيدة (وضع السيرفر)...', 48);
        await enableRemoteConnections(config.dataDir);
    }

    progress('جاري تشغيل PostgreSQL...', 50);
    const currentSvc = await queryService(serviceName);
    if (currentSvc.exists && !currentSvc.isRunning) {
        try {
            await startService(serviceName);
        } catch (error) {
            console.error(`[postgres] فشل تشغيل ${serviceName}:`, error?.message);
        }
    }

    // ── الخطوة 6: انتظر البورت ──────────────────────────────────────────────
    progress('جاري انتظار PostgreSQL...', 55);
    const portReady = await waitForPort(config.host, config.port, 180000);
    if (!portReady) {
        const msg = `لم يتمكن PostgreSQL من البدء خلال 3 دقائق. حاول إعادة تشغيل الجهاز.`;
        if (dialog) {
            await dialog.showMessageBox({ type: 'error', title: 'خطأ', message: msg });
        }
        return { ok: false, error: new Error(msg) };
    }

    // ── الخطوة 7: إنشاء المستخدم وقاعدة البيانات (مع إعادة المحاولة) ────────
    progress('جاري إنشاء قاعدة البيانات...', 60);

    let roleError = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            // انتظر قليلاً بعد تشغيل الـ service
            await sleep(attempt === 1 ? 5000 : 3000);
            await ensureDatabaseAndRole(config);
            roleError = null;
            break;
        } catch (error) {
            roleError = error;
            console.warn(`[postgres] محاولة ${attempt}/5 فشلت:`, error?.message);
            if (attempt < 5) {
                progress(`جاري إعادة المحاولة... (${attempt}/5)`, 60 + attempt);
            }
        }
    }

    // ── الخطوة 8: اختبار الاتصال النهائي ────────────────────────────────────
    progress('جاري التحقق من الاتصال...', 70);
    const finalTest = await testPrismaConnection(config.rawUrl);
    if (!finalTest.ok) {
        let msg;
        if (roleError) {
            msg = `فشل إنشاء قاعدة البيانات: ${roleError.message}`;
        } else {
            msg = `تعذر الاتصال بقاعدة البيانات بعد التثبيت. حاول إعادة تشغيل الجهاز والبرنامج.`;
        }
        if (dialog) {
            await dialog.showMessageBox({ type: 'error', title: 'خطأ', message: msg });
        }
        return { ok: false, error: new Error(msg) };
    }

    // ── الخطوة 9: تشغيل المهاجرات + البيانات الأولية ────────────────────────
    progress('جاري تجهيز جداول البيانات...', 75);
    try {
        await runPrismaMigrateDeploy(config, isPackaged);
    } catch (migrateError) {
        console.error('[postgres] فشل تشغيل المهاجرات:', migrateError.message);
        // إذا كان خطأ تعارض Migrations (P3009)
        if (migrateError.message.includes('P3009') || migrateError.message.includes('failed migrations')) {
            const err = new Error('تعارض في بيانات النظام: تم العثور على عمليات سابقة فاشلة في قاعدة البيانات. يرجى إعادة ضبط قاعدة البيانات (Reset) للحل.');
            err.code = 'P3009';
            throw err;
        }
        throw migrateError;
    }

    progress('جاري تجهيز البيانات الأولية...', 85);
    const bootstrapResult = await runInitialBootstrap(config, isPackaged);

    // ── الخطوة 10: حفظ الإعدادات ────────────────────────────────────────────
    if (appInstance) {
        await persistRuntimeDatabaseEnv(appInstance, { ...config, serviceName });
    }

    progress('تم تجهيز قاعدة البيانات بنجاح! ✅', 100);
    return { ok: true, installed: !serviceFound, bootstrapResult };
};

/**
 * يقوم بمسح شامل لقاعدة البيانات وكل ملفات PostgreSQL المرتبطة بالبرنامج
 * للبدء من جديد تماماً.
 */
const wipeAndRecreateDatabase = async ({ app, BrowserWindow, dialog, isPackaged, configOverride, onProgress }) => {
    const config = configOverride || parseDatabaseConfig();
    if (!config) throw new Error('لا يوجد إعدادات قاعدة بيانات لمسحها.');

    const progress = (msg, pct) => {
        console.log(`[postgres-wipe] [${pct}%] ${msg}`);
        onProgress?.(msg, pct);
    };

    // 0. محاولة حذف قاعدة البيانات برمجياً أولاً (SQL Wipe) لضمان اختفائها من pgAdmin
    try {
        const binDir = findPostgresBinDir(config);
        if (binDir) {
            progress('جاري مسح قاعدة البيانات برمجياً...', 5);
            await dropDatabaseOnly(config).catch(() => {});
        }
    } catch (e) {
        console.warn('[postgres-wipe] فشل المسح البرمجي:', e.message);
    }


    // 1. حذف ملف الـ runtime env لضمان العودة لشاشة الإعداد
    try {
        const envPath = getUserRuntimeEnvPath(app);
        if (fs.existsSync(envPath)) {
            progress('جاري حذف ملف الإعدادات...', 10);
            fs.unlinkSync(envPath);
        }
    } catch (err) {
        console.warn('[postgres-wipe] فشل حذف ملف runtime.env:', err.message);
    }

    // 2. كشف المسار الحقيقي وإيقاف وحذف الخدمة
    progress('جاري إيقاف الخدمة وكشف مسار البيانات...', 20);
    const svc = await findOurPostgresService(config.serviceName);
    let realDataDir = null;

    if (svc && svc.exists) {
        // قبل حذف الخدمة، نعرف مكان الداتا الحقيقي بتاعها
        realDataDir = await getServiceDataDir(svc.name);
        
        try {
            await runProcess('sc.exe', ['stop', svc.name], { timeoutMs: 30000 }).catch(() => {});
            await sleep(3000);
            
            progress('جاري حذف الخدمة المسجلة...', 30);
            await runProcess('sc.exe', ['delete', svc.name], { timeoutMs: 15000 }).catch(() => {});
        } catch (err) {
            console.warn('[postgres-wipe] فشل في إزالة الخدمة:', err.message);
        }
    }

    // 3. تحديد وحذف مجلد البيانات (الأولوية للمسار الحقيقي المستخرج من الخدمة)
    let dataDir = realDataDir || config.dataDir;
    if (!dataDir) {
        dataDir = getDefaultDataDir(app);
    }

    if (dataDir && fs.existsSync(dataDir)) {
        progress(`جاري حذف مجلد البيانات الحقيقي: ${dataDir}`, 50);
        try {
            await fsp.rm(dataDir, { recursive: true, force: true });
        } catch (err) {
            console.warn(`[postgres-wipe] فشل حذف المجلد عبر Node، محاولة عبر rmdir...`);
            await runProcess('cmd.exe', ['/c', 'rmdir', '/s', '/q', `"${dataDir}"`], { timeoutMs: 30000 }).catch(() => {});
        }
    }

    progress('تم مسح البيانات بنجاح! ✅ يرجى إعادة تشغيل البرنامج.', 100);
    return { success: true, needsRestart: true };
};



// ── Lock wrapper ─────────────────────────────────────────────────────────────


const ensurePostgresDatabaseReadyWithLock = async ({ app, BrowserWindow, dialog, isPackaged, lockManager, onProgress }) => {
    if (!lockManager) {
        return ensurePostgresDatabaseReady({ app, BrowserWindow, dialog, isPackaged, onProgress });
    }

    try { await lockManager.acquireLock(); }
    catch (e) { console.warn('[postgres] لم يتم الحصول على القفل:', e?.message); }

    try {
        return await ensurePostgresDatabaseReady({ app, BrowserWindow, dialog, isPackaged, onProgress });
    } finally {
        await lockManager.releaseLock();
    }
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // مستخدمة في main.js
    buildConnectionUrl,
    ensurePostgresDatabaseReadyWithLock,
    wipeAndRecreateDatabase,
    getUserRuntimeEnvPath,
    parseDatabaseConfig,
    testPrismaConnection,
    getDefaultDataDir,

    // مستخدمة في database-maintenance.js
    findPostgresBinDir,
    runProcess,
    dropAndRecreateDatabase
};

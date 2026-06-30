const fsSync = require("fs");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");
const { generateBuildAssets } = require("./generate-build-assets");

const projectRoot = process.cwd();
const packageJson = JSON.parse(
  fsSync.readFileSync(path.join(projectRoot, "package.json"), "utf8")
);
const outputDirName = packageJson?.build?.directories?.output || "release";
const productName = packageJson?.build?.productName || packageJson?.name || "Electron";
const productExeName = `${productName}.exe`;
const unpackedDir = path.join(projectRoot, outputDirName, "win-unpacked");
const prismaClientDir = path.join(projectRoot, "node_modules", ".prisma", "client");
const rootEnvPath = path.join(projectRoot, ".env");
const runtimeEnvPath = path.join(projectRoot, "electron", "runtime.env");
const vendorDir = path.join(projectRoot, "vendor");
const DEFAULT_POSTGRES_INSTALLER_FILE = "postgresql-16.4-1-windows-x64.exe";
const DEFAULT_POSTGRES_INSTALLER_URL = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe";
const DEFAULT_LOCAL_DATABASE_HOST = "localhost";
const DEFAULT_LOCAL_DATABASE_PORT = 5432;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvContent(content) {
  return String(content || "")
    .split(/\r?\n/)
    .reduce((accumulator, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        return accumulator;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function quoteEnvValue(value) {
  return JSON.stringify(String(value ?? ""));
}

function upsertEnvSetting(content, key, value) {
  const normalizedContent = String(content ?? "");
  const nextLine = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^\\s*${key}=.*$`, "m");

  if (pattern.test(normalizedContent)) {
    return normalizedContent.replace(pattern, nextLine);
  }

  const trimmed = normalizedContent.replace(/\s*$/, "");
  return `${trimmed}${trimmed ? "\n" : ""}${nextLine}\n`;
}

function getPostgresInstallerConfig(envMap = {}) {
  return {
    installerFileName:
      String(envMap.ERP_PG_INSTALLER_FILE || DEFAULT_POSTGRES_INSTALLER_FILE).trim() ||
      DEFAULT_POSTGRES_INSTALLER_FILE,
    installerUrl:
      String(envMap.ERP_PG_INSTALLER_URL || DEFAULT_POSTGRES_INSTALLER_URL).trim() ||
      DEFAULT_POSTGRES_INSTALLER_URL,
  };
}

function parseConnectionString(connectionString) {
  const rawValue = String(connectionString || "").trim();
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "postgresql:" && protocol !== "postgres:") {
      return null;
    }

    return {
      host: parsed.hostname || DEFAULT_LOCAL_DATABASE_HOST,
      port: Number(parsed.port || DEFAULT_LOCAL_DATABASE_PORT),
      databaseName: String(parsed.pathname || "").replace(/^\/+/, "").trim(),
      appUser: decodeURIComponent(parsed.username || "").trim(),
      appPassword: decodeURIComponent(parsed.password || ""),
    };
  } catch {
    return null;
  }
}

function buildConnectionUrl({ user, password, host, port, database }) {
  return `postgresql://${encodeURIComponent(String(user || ""))}:${encodeURIComponent(
    String(password || "")
  )}@${String(host || DEFAULT_LOCAL_DATABASE_HOST)}:${Number(port || DEFAULT_LOCAL_DATABASE_PORT)}/${String(
    database || ""
  )}`;
}

function buildBundledLocalDatabaseUrl(envMap = {}) {
  const parsedDatabaseUrl = parseConnectionString(envMap.DATABASE_URL);
  const host = DEFAULT_LOCAL_DATABASE_HOST;
  const port =
    Number.parseInt(String(envMap.ERP_PG_PORT || "").trim(), 10) ||
    Number(parsedDatabaseUrl?.port || DEFAULT_LOCAL_DATABASE_PORT);
  const databaseName =
    String(envMap.ERP_DB_NAME || "").trim() ||
    String(parsedDatabaseUrl?.databaseName || "").trim();
  const appUser =
    String(envMap.ERP_DB_USER || "").trim() ||
    String(parsedDatabaseUrl?.appUser || "").trim();
  const appPassword =
    String(envMap.ERP_DB_PASSWORD || "").trim() ||
    String(parsedDatabaseUrl?.appPassword || "");

  if (!databaseName || !appUser) {
    throw new Error(
      "Local PostgreSQL packaging requires ERP_DB_NAME and ERP_DB_USER (or a valid local DATABASE_URL)."
    );
  }

  return {
    rawUrl: buildConnectionUrl({
      user: appUser,
      password: appPassword,
      host,
      port,
      database: databaseName,
    }),
    appPassword,
  };
}

async function downloadWithRedirects(url, destinationPath) {
  const transport = String(url).startsWith("http:") ? http : https;
  const tempPath = `${destinationPath}.download`;

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const request = transport.get(url, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const redirectLocation = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && redirectLocation) {
        response.resume();
        const redirectUrl = new URL(redirectLocation, url).toString();
        downloadWithRedirects(redirectUrl, destinationPath).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`installer download failed with status ${statusCode}`));
        return;
      }

      const fileStream = fsSync.createWriteStream(tempPath);
      response.pipe(fileStream);

      fileStream.on("finish", async () => {
        try {
          fileStream.close();
          await fs.rename(tempPath, destinationPath);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      fileStream.on("error", async (error) => {
        response.destroy();
        await fs.rm(tempPath, { force: true }).catch(() => {});
        reject(error);
      });
    });

    request.on("error", async (error) => {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      reject(error);
    });
  });
}

async function ensureBundledPostgresInstaller(envMap = {}) {
  const installerConfig = getPostgresInstallerConfig(envMap);
  const targetPath = path.join(vendorDir, installerConfig.installerFileName);

  try {
    await fs.access(targetPath);
    console.log(`prepare-dist: using bundled PostgreSQL installer at ${targetPath}`);
    return installerConfig;
  } catch {
    // Download below.
  }

  if (!installerConfig.installerUrl) {
    throw new Error("ERP_PG_INSTALLER_URL is not configured for bundled PostgreSQL setup.");
  }

  console.log(`prepare-dist: downloading PostgreSQL installer to ${targetPath}`);
  await downloadWithRedirects(installerConfig.installerUrl, targetPath);
  console.log("prepare-dist: PostgreSQL installer download completed");
  return installerConfig;
}

function stopProductProcessByName() {
  if (process.platform !== "win32") return;

  const result = spawnSync("taskkill", ["/F", "/IM", productExeName, "/T"], {
    stdio: "ignore",
  });

  // taskkill returns non-zero when the process does not exist; ignore that case.
  if (result.error) {
    console.warn("prepare-dist: could not run taskkill:", result.error.message);
  }
}

function stopProcessesFromUnpackedDir() {
  if (process.platform !== "win32") return;

  const normalizedTarget = unpackedDir.replace(/\\/g, "\\\\");
  const script = `
    $target = "${normalizedTarget}".ToLowerInvariant()
    Get-CimInstance Win32_Process |
      Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLowerInvariant().StartsWith($target) } |
      ForEach-Object {
        try {
          Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
          Write-Host ("Stopped process PID " + $_.ProcessId + " (" + $_.Name + ")")
        } catch {
          Write-Host ("Failed to stop PID " + $_.ProcessId + ": " + $_.Exception.Message)
        }
      }
  `;

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.warn("prepare-dist: could not query/stop processes:", result.error.message);
  }
}

async function removeUnpackedDirWithRetry() {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(unpackedDir, { recursive: true, force: true });
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      console.warn(
        `prepare-dist: remove attempt ${attempt}/${maxAttempts} failed: ${error.message}`
      );
    }

    try {
      await fs.access(unpackedDir);
      if (attempt === maxAttempts) {
        throw new Error(`still exists after ${maxAttempts} attempts`);
      }
      await sleep(Math.min(2000, 200 * attempt));
      continue;
    } catch {
      return;
    }
  }
}

async function cleanupPrismaTempFiles() {
  try {
    const entries = await fs.readdir(prismaClientDir, { withFileTypes: true });
    const tempFiles = entries
      .filter((entry) => entry.isFile() && entry.name.includes(".tmp"))
      .map((entry) => entry.name);

    if (tempFiles.length === 0) return;

    await Promise.all(
      tempFiles.map((name) =>
        fs.rm(path.join(prismaClientDir, name), { force: true })
      )
    );

    console.log(`prepare-dist: removed ${tempFiles.length} Prisma temp file(s)`);
  } catch (error) {
    // Optional cleanup, continue packaging if not available.
    console.warn("prepare-dist: prisma temp cleanup skipped:", error.message);
  }
}

async function syncRuntimeEnvFile() {
  const rawEnvContent = await fs.readFile(rootEnvPath, "utf8");
  const envMap = parseEnvContent(rawEnvContent);
  const installerConfig = await ensureBundledPostgresInstaller(envMap);
  const bundledLocalDatabase = buildBundledLocalDatabaseUrl(envMap);
  let runtimeEnvContent = rawEnvContent;

  runtimeEnvContent = upsertEnvSetting(runtimeEnvContent, "DATABASE_URL", bundledLocalDatabase.rawUrl);
  runtimeEnvContent = upsertEnvSetting(runtimeEnvContent, "ERP_PG_INSTALL_MODE", "bundled");
  runtimeEnvContent = upsertEnvSetting(
    runtimeEnvContent,
    "ERP_PG_INSTALLER_FILE",
    installerConfig.installerFileName
  );
  runtimeEnvContent = upsertEnvSetting(
    runtimeEnvContent,
    "ERP_PG_INSTALLER_URL",
    installerConfig.installerUrl
  );
  runtimeEnvContent = upsertEnvSetting(
    runtimeEnvContent,
    "ERP_DB_PASSWORD",
    bundledLocalDatabase.appPassword
  );

  // Ensure ERP_DB_NAME and ERP_DB_USER are always present for readBundledDatabaseConfig
  const parsedBundledUrl = parseConnectionString(bundledLocalDatabase.rawUrl);
  if (parsedBundledUrl) {
    if (parsedBundledUrl.databaseName) {
      runtimeEnvContent = upsertEnvSetting(runtimeEnvContent, "ERP_DB_NAME", parsedBundledUrl.databaseName);
    }
    if (parsedBundledUrl.appUser) {
      runtimeEnvContent = upsertEnvSetting(runtimeEnvContent, "ERP_DB_USER", parsedBundledUrl.appUser);
    }
  }

  await fs.mkdir(path.dirname(runtimeEnvPath), { recursive: true });
  await fs.writeFile(runtimeEnvPath, runtimeEnvContent, "utf8");
  console.log("prepare-dist: synced .env -> electron/runtime.env (bundled PostgreSQL mode)");
}

async function main() {
  await generateBuildAssets();
  await syncRuntimeEnvFile();
  await cleanupPrismaTempFiles();
  stopProductProcessByName();
  stopProcessesFromUnpackedDir();
  await removeUnpackedDirWithRetry();
  console.log(`prepare-dist: ${outputDirName}/win-unpacked is ready`);
}

main().catch((error) => {
  console.error("prepare-dist: failed:", error.message);
  console.error(
    "prepare-dist: close any running app built from win-unpacked, then retry npm run dist."
  );
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const resolvePackagedPrismaEngineEnv = ({
    isPackaged = process.mainModule?.filename?.includes('app.asar') || false,
    resourcesPath = process.resourcesPath,
    platform = process.platform
} = {}) => {
    if (!isPackaged || !resourcesPath) {
        return {};
    }

    const enginesDir = path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@prisma',
        'engines'
    );

    if (!fs.existsSync(enginesDir)) {
        return {};
    }

    if (platform === 'win32') {
        const schemaEnginePath = path.join(enginesDir, 'schema-engine-windows.exe');
        const queryEngineLibraryPath = path.join(enginesDir, 'query_engine-windows.dll.node');
        const env = {};

        if (fs.existsSync(schemaEnginePath)) {
            env.PRISMA_SCHEMA_ENGINE_BINARY = schemaEnginePath;
            env.PRISMA_MIGRATION_ENGINE_BINARY = schemaEnginePath;
        }

        if (fs.existsSync(queryEngineLibraryPath)) {
            env.PRISMA_QUERY_ENGINE_LIBRARY = queryEngineLibraryPath;
        }

        return env;
    }

    return {};
};

const applyPackagedPrismaEngineEnv = (targetEnv = process.env, options = {}) => {
    const overrides = resolvePackagedPrismaEngineEnv(options);

    for (const [key, value] of Object.entries(overrides)) {
        targetEnv[key] = value;
    }

    return overrides;
};

module.exports = {
    applyPackagedPrismaEngineEnv,
    resolvePackagedPrismaEngineEnv
};

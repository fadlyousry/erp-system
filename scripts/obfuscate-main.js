const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const sourceDir = path.join(__dirname, '..', 'electron');
const targetDir = path.join(__dirname, '..', 'dist', 'electron');

const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    numbersToExpressions: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1,
    splitStrings: false,
    rotateStringArray: true,
    // We must NOT rename globals because Electron's IPC and main entry point rely on them
    renameGlobals: false,
    identifierNamesGenerator: 'mangled',
};

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

async function obfuscateFolder(currentDir) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const relativePath = path.relative(sourceDir, fullPath);
        const targetPath = path.join(targetDir, relativePath);

        if (fs.statSync(fullPath).isDirectory()) {
            obfuscateFolder(fullPath);
        } else if (file.endsWith('.js')) {
            console.log(`Obfuscating: ${relativePath}`);
            const code = fs.readFileSync(fullPath, 'utf8');
            const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions).getObfuscatedCode();
            
            ensureDirectoryExistence(targetPath);
            fs.writeFileSync(targetPath, obfuscatedCode, 'utf8');
        } else {
            // Copy non-js files (like .env or .json if any)
            console.log(`Copying: ${relativePath}`);
            ensureDirectoryExistence(targetPath);
            fs.copyFileSync(fullPath, targetPath);
        }
    }
}

console.log('Starting Electron Main Process Obfuscation...');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

try {
    obfuscateFolder(sourceDir);
    console.log('✓ Electron Main Process Obfuscation Completed.');
} catch (error) {
    console.error('✗ Obfuscation Failed:', error);
    process.exit(1);
}

const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function setupAutoUpdater(mainWindow) {
    // لا تنزّل تلقائياً - خلّي المستخدم يقرر
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // إرسال حالة التحديث للواجهة
    autoUpdater.on('checking-for-update', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', { status: 'checking' });
        }
    });

    autoUpdater.on('update-available', (info) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', {
                status: 'available',
                version: info.version,
                releaseDate: info.releaseDate
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', { status: 'up-to-date' });
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', {
                status: 'downloading',
                percent: progress.percent,
                transferred: progress.transferred,
                total: progress.total
            });
        }
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', { status: 'ready' });
        }
    });

    autoUpdater.on('error', (error) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update:status', {
                status: 'error',
                message: error?.message
            });
        }
    });

    // IPC handlers - الواجهة تتحكم في التحديث
    ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
    ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
    ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

    // فحص تلقائي عند بدء التشغيل (فقط في الإصدار المبني)
    if (require('electron').app.isPackaged) {
        autoUpdater.checkForUpdates().catch(() => {});

        // فحص كل 30 دقيقة
        setInterval(() => {
            autoUpdater.checkForUpdates().catch(() => {});
        }, 30 * 60 * 1000);
    }
}

module.exports = { setupAutoUpdater };

/**
 * Bootstrap Lock System
 * 
 * يضمن أن تهيئة الداتابيز تحدث مرة واحدة فقط، ويمنع التشغيل المتوازي
 * الذي قد يسبب فشل المهاجرات والبيانات المكررة
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 دقائق
const LOCK_CHECK_INTERVAL_MS = 500; // 0.5 ثانية

class BootstrapLockManager {
    constructor(appInstance) {
        this.appInstance = appInstance;
        this.lockFilePath = null;
        this.lockData = {
            pid: process.pid,
            startedAt: null,
            status: 'initializing' // initializing, migrations, bootstrap, completed, failed
        };
        this.isLockOwner = false;
    }

    getLockFilePath() {
        if (this.lockFilePath) {
            return this.lockFilePath;
        }
        const userDataPath = this.appInstance.getPath('userData');
        this.lockFilePath = path.join(userDataPath, '.database-bootstrap.lock');
        return this.lockFilePath;
    }

    getBootstrapStatusPath() {
        const userDataPath = this.appInstance.getPath('userData');
        return path.join(userDataPath, '.database-bootstrap-status.json');
    }

    /**
     * محاولة الحصول على القفل
     * ينتظر إذا كان القفل موجوداً حتى ينتهي الآخر أو ينتهي وقت الانتظار
     */
    async acquireLock() {
        const lockPath = this.getLockFilePath();
        const maxWaitTime = Date.now() + LOCK_TIMEOUT_MS;

        while (true) {
            try {
                // محاولة قراءة القفل الموجود
                const existingLockText = await fsp.readFile(lockPath, 'utf8').catch(() => null);
                
                if (existingLockText) {
                    try {
                        const existingLock = JSON.parse(existingLockText);
                        const lockAgeMs = Date.now() - (existingLock.startedAt || 0);
                        
                        // إذا كان القفل قديماً (timeout)، احذفه
                        if (lockAgeMs > LOCK_TIMEOUT_MS) {
                            console.warn(
                                `[bootstrap-lock] Old lock file detected (age: ${lockAgeMs}ms). Removing it.`,
                                existingLock
                            );
                            await fsp.rm(lockPath, { force: true }).catch(() => {});
                        } else {
                            // القفل جديد، انتظر
                            if (Date.now() >= maxWaitTime) {
                                throw new Error(
                                    `تعذر الحصول على قفل التهيئة. ` +
                                    `هناك عملية أخرى تهيز قاعدة البيانات منذ ${Math.round(lockAgeMs / 1000)} ثانية.`
                                );
                            }
                            
                            await this.sleep(LOCK_CHECK_INTERVAL_MS);
                            continue;
                        }
                    } catch (error) {
                        if (error.message?.includes('تعذر الحصول على قفل')) {
                            throw error;
                        }
                        // ملف تالف، احذفه
                        await fsp.rm(lockPath, { force: true }).catch(() => {});
                    }
                }

                // حاول إنشاء القفل بشكل حصري
                this.lockData.startedAt = Date.now();
                const lockContent = JSON.stringify(this.lockData, null, 2);
                
                try {
                    // استخدم flag 'wx' للكتابة الحصرية (سيفشل إذا كان الملف موجوداً)
                    await fsp.writeFile(lockPath, lockContent, { flag: 'wx', encoding: 'utf8' });
                    this.isLockOwner = true;
                    
                    console.log('[bootstrap-lock] Lock acquired successfully', {
                        pid: process.pid,
                        lockPath
                    });
                    
                    return true;
                } catch (error) {
                    // الملف تم إنشاؤه من قبل العملية الأخرى في نفس الوقت
                    if (Date.now() >= maxWaitTime) {
                        throw new Error('تجاوز وقت الانتظار للحصول على قفل التهيئة');
                    }
                    
                    await this.sleep(LOCK_CHECK_INTERVAL_MS);
                    continue;
                }
            } catch (error) {
                console.error('[bootstrap-lock] Failed to acquire lock:', error);
                throw error;
            }
        }
    }

    /**
     * تحديث حالة التهيئة
     */
    async updateStatus(status, details = {}) {
        const statusPath = this.getBootstrapStatusPath();
        const statusData = {
            timestamp: new Date().toISOString(),
            pid: process.pid,
            status, // initializing, migrations, bootstrap, completed, failed
            details,
            lockAge: this.isLockOwner ? Date.now() - this.lockData.startedAt : null
        };

        try {
            await fsp.mkdir(path.dirname(statusPath), { recursive: true });
            await fsp.writeFile(statusPath, JSON.stringify(statusData, null, 2), 'utf8');
        } catch (error) {
            console.warn('[bootstrap-lock] Failed to update status file:', error);
            // لا نرمي error هنا لأن هذا ليس حرجاً
        }
    }

    /**
     * التحقق من هل تم تنفيذ التهيئة بنجاح من قبل
     */
    async getLastBootstrapStatus() {
        const statusPath = this.getBootstrapStatusPath();
        try {
            const content = await fsp.readFile(statusPath, 'utf8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * تحرير القفل
     */
    async releaseLock() {
        if (!this.isLockOwner) {
            return false;
        }

        const lockPath = this.getLockFilePath();
        try {
            await fsp.rm(lockPath, { force: true });
            this.isLockOwner = false;
            console.log('[bootstrap-lock] Lock released');
            return true;
        } catch (error) {
            console.warn('[bootstrap-lock] Failed to release lock:', error);
            return false;
        }
    }

    /**
     * تنظيف القفل عند الخروج الطاريء (في حالة الفشل)
     */
    async forceCleanup() {
        const lockPath = this.getLockFilePath();
        try {
            await fsp.rm(lockPath, { force: true });
            console.log('[bootstrap-lock] Lock force cleaned');
        } catch (error) {
            console.warn('[bootstrap-lock] Failed to force cleanup lock:', error);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    BootstrapLockManager,
    LOCK_TIMEOUT_MS,
    LOCK_CHECK_INTERVAL_MS
};

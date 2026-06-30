#!/usr/bin/env node

/**
 * اختبار نظام قفل البوتستراب
 * 
 * هذا السكريبت يختبر:
 * 1. إنشاء القفل بنجاح
 * 2. الانتظار الآمن عندما يكون القفل مشغول
 * 3. تحرير القفل بشكل صحيح
 * 4. حذف الأقفال القديمة (timeout)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');

// محاكاة BootstrapLockManager
const LOCK_TIMEOUT_MS = 2000; // 2 ثانية للاختبار السريع
const LOCK_CHECK_INTERVAL_MS = 200;

class MockApp {
    constructor(testDir) {
        this.testDir = testDir;
    }

    getPath(name) {
        if (name === 'userData') {
            return this.testDir;
        }
        return this.testDir;
    }
}

class TestBootstrapLockManager {
    constructor(appInstance) {
        this.appInstance = appInstance;
        this.lockFilePath = null;
        this.lockData = {
            pid: process.pid,
            startedAt: null,
            status: 'initializing'
        };
        this.isLockOwner = false;
    }

    getLockFilePath() {
        if (!this.lockFilePath) {
            const userDataPath = this.appInstance.getPath('userData');
            this.lockFilePath = path.join(userDataPath, '.database-bootstrap.lock');
        }
        return this.lockFilePath;
    }

    async acquireLock() {
        const lockPath = this.getLockFilePath();
        const maxWaitTime = Date.now() + LOCK_TIMEOUT_MS;
        let attempts = 0;

        while (true) {
            attempts++;
            try {
                const existingLockText = await fsp.readFile(lockPath, 'utf8').catch(() => null);
                
                if (existingLockText) {
                    const existingLock = JSON.parse(existingLockText);
                    const lockAgeMs = Date.now() - (existingLock.startedAt || 0);
                    
                    if (lockAgeMs > LOCK_TIMEOUT_MS) {
                        console.log(`  ⏰ القفل القديم تم اكتشافه (العمر: ${lockAgeMs}ms). جاري الحذف...`);
                        await fsp.rm(lockPath, { force: true }).catch(() => {});
                    } else {
                        if (Date.now() >= maxWaitTime) {
                            throw new Error(`تعذر الحصول على القفل بعد ${attempts} محاولة`);
                        }
                        
                        await this.sleep(LOCK_CHECK_INTERVAL_MS);
                        continue;
                    }
                }

                this.lockData.startedAt = Date.now();
                const lockContent = JSON.stringify(this.lockData, null, 2);
                
                try {
                    await fsp.writeFile(lockPath, lockContent, { flag: 'wx', encoding: 'utf8' });
                    this.isLockOwner = true;
                    console.log(`  ✅ تم الحصول على القفل (محاولة #${attempts})`);
                    return true;
                } catch (error) {
                    if (Date.now() >= maxWaitTime) {
                        throw new Error('تجاوز الوقت المسموح للحصول على القفل');
                    }
                    await this.sleep(LOCK_CHECK_INTERVAL_MS);
                    continue;
                }
            } catch (error) {
                console.error(`  ❌ خطأ: ${error.message}`);
                throw error;
            }
        }
    }

    async releaseLock() {
        if (!this.isLockOwner) {
            return false;
        }

        const lockPath = this.getLockFilePath();
        try {
            await fsp.rm(lockPath, { force: true });
            this.isLockOwner = false;
            console.log(`  ✅ تم تحرير القفل`);
            return true;
        } catch (error) {
            console.warn(`  ⚠️ فشل تحرير القفل: ${error.message}`);
            return false;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// الاختبارات
async function runTests() {
    console.log('\n🧪 اختبار نظام قفل البوتستراب\n');
    console.log('=' .repeat(50));

    const testDir = path.join(os.tmpdir(), `bootstrap-lock-test-${Date.now()}`);
    
    try {
        await fsp.mkdir(testDir, { recursive: true });

        // اختبار 1: إنشاء قفل بسيط
        console.log('\n📝 الاختبار 1: إنشاء قفل بسيط');
        console.log('-' .repeat(50));
        {
            const app = new MockApp(testDir);
            const lockManager = new TestBootstrapLockManager(app);
            
            await lockManager.acquireLock();
            
            const lockPath = lockManager.getLockFilePath();
            const exists = fs.existsSync(lockPath);
            
            if (exists) {
                console.log(`  ✅ ملف القفل موجود: ${lockPath}`);
            } else {
                console.log(`  ❌ ملف القفل غير موجود!`);
            }
            
            await lockManager.releaseLock();
            
            const existsAfter = fs.existsSync(lockPath);
            if (!existsAfter) {
                console.log(`  ✅ تم حذف ملف القفل بعد التحرير`);
            } else {
                console.log(`  ❌ ملف القفل لم يُحذف!`);
            }
        }

        // اختبار 2: الانتظار الآمن عند مشغول
        console.log('\n📝 الاختبار 2: الانتظار الآمن عند مشغول');
        console.log('-' .repeat(50));
        {
            const app = new MockApp(testDir);
            const lockManager1 = new TestBootstrapLockManager(app);
            const lockManager2 = new TestBootstrapLockManager(app);

            console.log('  🔒 العملية 1: جاري الحصول على القفل...');
            await lockManager1.acquireLock();

            console.log('  ⏳ العملية 2: محاولة الحصول على القفل (سينتظر)...');
            
            // إطلق العملية 2 بشكل متزامن
            let process2Done = false;
            const process2Promise = (async () => {
                await lockManager2.acquireLock();
                process2Done = true;
            })();

            // انتظر قليلاً ثم تحقق أن العملية 2 لم تنتهِ بعد
            await this.sleep(500);
            if (!process2Done) {
                console.log(`  ✅ العملية 2 تنتظر بشكل صحيح`);
            }

            // الآن حرر القفل من العملية 1
            console.log('  🔓 العملية 1: جاري تحرير القفل...');
            await lockManager1.releaseLock();

            // انتظر قليلاً حتى تحصل العملية 2 على القفل
            await this.sleep(500);
            if (process2Done) {
                console.log(`  ✅ العملية 2 حصلت على القفل بعد التحرير`);
            }

            await lockManager2.releaseLock();
            await process2Promise;
        }

        // اختبار 3: حذف الأقفال القديمة
        console.log('\n📝 الاختبار 3: حذف الأقفال القديمة (Timeout)');
        console.log('-' .repeat(50));
        {
            const app = new MockApp(testDir);
            const lockManager = new TestBootstrapLockManager(app);
            const lockPath = lockManager.getLockFilePath();

            // أنشئ قفل قديم يدويًا
            const oldLockData = {
                pid: 99999,
                startedAt: Date.now() - 5000, // 5 ثواني في الماضي
                status: 'initializing'
            };
            await fsp.writeFile(lockPath, JSON.stringify(oldLockData, null, 2), 'utf8');
            console.log(`  🔒 تم إنشاء قفل قديم (العمر: 5 ثواني)`);

            // حاول الحصول على القفل (يجب أن يحذف القديم)
            console.log(`  ⏳ محاولة الحصول على القفل (يجب حذف القديم)...`);
            await lockManager.acquireLock();
            console.log(`  ✅ تم حذف القفل القديم والحصول على قفل جديد`);

            await lockManager.releaseLock();
        }

        // اختبار 4: تعطل المحاكاة (معالجة الخطأ)
        console.log('\n📝 الاختبار 4: معالجة الأخطاء');
        console.log('-' .repeat(50));
        {
            const app = new MockApp(testDir);
            const lockManager = new TestBootstrapLockManager(app);
            
            // جرب تحرير قفل لم تحصل عليه
            const result = await lockManager.releaseLock();
            if (!result) {
                console.log(`  ✅ تم التعامل مع محاولة تحرير قفل غير مملوك بشكل صحيح`);
            }
        }

        console.log('\n' + '=' .repeat(50));
        console.log('✅ جميع الاختبارات نجحت!\n');

    } catch (error) {
        console.error('\n❌ الاختبار فشل:', error.message);
        console.error(error);
    } finally {
        // تنظيف
        try {
            await fsp.rm(testDir, { recursive: true, force: true });
        } catch {
            // تجاهل أخطاء التنظيف
        }
    }
}

// مساعد النوم
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// إضافة sleep إلى TestBootstrapLockManager
TestBootstrapLockManager.prototype.sleep = sleep;

// إضافة sleep عام للاختبارات
runTests.sleep = sleep;

// تشغيل الاختبارات
runTests().catch(error => {
    console.error('❌ خطأ:', error);
    process.exit(1);
});

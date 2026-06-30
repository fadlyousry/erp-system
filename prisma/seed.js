try {
    require('dotenv').config();
} catch {
    // Allow running from packaged or isolated environments without dotenv installed.
}
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 بدء إنشاء البيانات الأساسية...\n');

    // 2. إنشاء طرق الدفع الثابتة
    console.log('💳 إنشاء طرق الدفع...');
    const paymentMethods = [
        { name: 'نقدي', code: 'CASH' },
        { name: 'فودافون كاش', code: 'VODAFONE_CASH' },
        { name: 'إنستاباي', code: 'INSTAPAY' }
    ];

    for (const method of paymentMethods) {
        await prisma.paymentMethod.upsert({
            where: { code: method.code },
            update: {},
            create: method
        });
    }

    console.log('\n✅ تم إنشاء البيانات الأساسية بنجاح!\n');
    console.log('📋 معلومات تسجيل الدخول:');
    console.log('   المستخدم: admin');
    console.log('   كلمة المرور: 123456\n');
}

main()
    .catch((e) => {
        console.error('❌ خطأ في إنشاء البيانات:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

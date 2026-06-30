try {
    require('dotenv').config();
} catch {
    // In packaged builds the bootstrap script receives its environment from Electron.
}

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PERMISSIONS } = require('./permissions');

const prisma = new PrismaClient();

const DEFAULT_PAYMENT_METHODS = [
    { name: 'نقدي', code: 'CASH' },
    { name: 'فيزا', code: 'VISA' },
    { name: 'ماستركارد', code: 'MASTERCARD' },
    { name: 'تحويل بنكي', code: 'BANK_TRANSFER' },
    { name: 'فودافون كاش', code: 'VODAFONE_CASH' },
    { name: 'إنستاباي', code: 'INSTAPAY' }
];

const DEFAULT_EXPENSE_CATEGORIES = [
    { name: 'إيجار', color: '#0284c7', icon: '🏢' },
    { name: 'مرتبات', color: '#16a34a', icon: '💼' },
    { name: 'مرافق', color: '#f59e0b', icon: '💡' },
    { name: 'نقل', color: '#7c3aed', icon: '🚚' },
    { name: 'صيانة', color: '#ef4444', icon: '🛠️' }
];

const DEFAULT_WAREHOUSE_NAME = 'المخزن الرئيسي';
const DEFAULT_TREASURY_CODE = 'MAIN';
const DEFAULT_TREASURY_NAME = 'الخزنة الرئيسية';

const getAdminCredentials = () => ({
    username: String(process.env.ERP_DEFAULT_ADMIN_USERNAME || 'admin').trim() || 'admin',
    password: String(process.env.ERP_DEFAULT_ADMIN_PASSWORD || '123456').trim() || '123456',
    name: String(process.env.ERP_DEFAULT_ADMIN_NAME || 'مدير النظام').trim() || 'مدير النظام'
});

async function ensureRBAC() {
    console.log('Seeding permissions...');
    const permissionMap = new Map();
    for (const p of PERMISSIONS) {
        const permission = await prisma.permission.upsert({
            where: { key: p.key },
            update: { name: p.name },
            create: p
        });
        permissionMap.set(p.key, permission.id);
    }

    console.log('Seeding roles...');
    const adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: { description: 'مدير النظام - صلاحيات كاملة' },
        create: { name: 'ADMIN', description: 'مدير النظام - صلاحيات كاملة' }
    });

    const cashierRole = await prisma.role.upsert({
        where: { name: 'CASHIER' },
        update: { description: 'كاشير - صلاحيات البيع فقط' },
        create: { name: 'CASHIER', description: 'كاشير - صلاحيات البيع فقط' }
    });

    const storekeeperRole = await prisma.role.upsert({
        where: { name: 'STOREKEEPER' },
        update: { description: 'أمين مخزن - صلاحيات المخزون والمنتجات' },
        create: { name: 'STOREKEEPER', description: 'أمين مخزن - صلاحيات المخزون والمنتجات' }
    });

    // Assign ALL permissions to ADMIN
    console.log('Assigning permissions to ADMIN...');
    for (const pId of permissionMap.values()) {
        await prisma.rolePermission.upsert({
            where: {
                roleId_permissionId: {
                    roleId: adminRole.id,
                    permissionId: pId
                }
            },
            update: {},
            create: {
                roleId: adminRole.id,
                permissionId: pId
            }
        });
    }

    // Assign CASHIER permissions
    console.log('Assigning permissions to CASHIER...');
    const cashierPerms = [
        'dashboard:view',
        'pos:view',
        'pos:create',
        'sales:view',
        'returns:view',
        'returns:create',
        'products:view',
        'customers:view',
        'customers:payments',
        'treasury:view'
    ];
    for (const key of cashierPerms) {
        const pId = permissionMap.get(key);
        if (pId) {
            await prisma.rolePermission.upsert({
                where: { roleId_permissionId: { roleId: cashierRole.id, permissionId: pId } },
                update: {},
                create: { roleId: cashierRole.id, permissionId: pId }
            });
        }
    }

    // Assign STOREKEEPER permissions
    console.log('Assigning permissions to STOREKEEPER...');
    const storekeeperPerms = [
        'dashboard:view',
        'products:view',
        'products:create',
        'products:edit',
        'products:stock',
        'warehouses:view',
        'warehouses:manage',
        'suppliers:view',
        'purchases:view',
        'purchases:create'
    ];
    for (const key of storekeeperPerms) {
        const pId = permissionMap.get(key);
        if (pId) {
            await prisma.rolePermission.upsert({
                where: { roleId_permissionId: { roleId: storekeeperRole.id, permissionId: pId } },
                update: {},
                create: { roleId: storekeeperRole.id, permissionId: pId }
            });
        }
    }

    return { adminRole, cashierRole, storekeeperRole };
}

async function ensureDefaultAdmin(adminRole) {
    const credentials = getAdminCredentials();

    // Check if the default admin user already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { username: credentials.username }
    });

    if (existingAdmin) {
        // If user exists but role is missing (from old system), assign it
        if (!existingAdmin.roleId) {
            console.log(`[bootstrap] Assigning ${adminRole.name} role to existing ${credentials.username} user...`);
            await prisma.user.update({
                where: { id: existingAdmin.id },
                data: { roleId: adminRole.id }
            });
        }
        return { created: false, updated: true, credentials };
    }

    const usersCount = await prisma.user.count();
    if (usersCount > 0) {
        // If any other users exist, we don't force-create the default admin
        return { created: false, skipped: true };
    }

    const hashedPassword = await bcrypt.hash(credentials.password, 10);

    await prisma.user.create({
        data: {
            name: credentials.name,
            username: credentials.username,
            password: hashedPassword,
            roleId: adminRole.id
        }
    });

    return {
        created: true,
        credentials
    };
}

async function ensurePaymentMethods() {
    await Promise.all(
        DEFAULT_PAYMENT_METHODS.map((method) =>
            prisma.paymentMethod.upsert({
                where: { code: method.code },
                update: {
                    name: method.name,
                    isActive: true
                },
                create: method
            })
        )
    );
}

async function ensureDefaultWarehouse() {
    await prisma.warehouse.upsert({
        where: { name: DEFAULT_WAREHOUSE_NAME },
        update: {
            isActive: true
        },
        create: {
            name: DEFAULT_WAREHOUSE_NAME,
            isActive: true
        }
    });
}

async function ensureDefaultTreasury() {
    const treasury = await prisma.treasury.upsert({
        where: { code: DEFAULT_TREASURY_CODE },
        update: {
            name: DEFAULT_TREASURY_NAME,
            isActive: true,
            isDeleted: false
        },
        create: {
            name: DEFAULT_TREASURY_NAME,
            code: DEFAULT_TREASURY_CODE,
            description: 'تم إنشاؤها تلقائيًا عند أول تشغيل',
            openingBalance: 0,
            currentBalance: 0,
            isActive: true,
            isDefault: true,
            isDeleted: false
        }
    });

    await prisma.treasury.updateMany({
        where: {
            id: { not: treasury.id }
        },
        data: {
            isDefault: false
        }
    });

    if (!treasury.isDefault) {
        await prisma.treasury.update({
            where: { id: treasury.id },
            data: { isDefault: true }
        });
    }
}

async function ensureExpenseCategories() {
    await Promise.all(
        DEFAULT_EXPENSE_CATEGORIES.map((category) =>
            prisma.expenseCategory.upsert({
                where: { name: category.name },
                update: {
                    color: category.color,
                    icon: category.icon
                },
                create: category
            })
        )
    );
}

async function main() {
    console.log('Starting bootstrap...');
    const { adminRole } = await ensureRBAC();
    const adminResult = await ensureDefaultAdmin(adminRole);
    await ensurePaymentMethods();
    await ensureDefaultWarehouse();
    await ensureDefaultTreasury();
    await ensureExpenseCategories();

    const result = {
        ok: true,
        adminCreated: Boolean(adminResult.created),
        adminCredentials: adminResult.created ? adminResult.credentials : null
    };

    console.log('Bootstrap completed successfully.');
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
    .catch((error) => {
        process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCustomerCycle() {
    console.log('--- Starting Customer Balance Cycle Test ---');
    console.log('Using DATABASE_URL:', process.env.DATABASE_URL);
    
    // 1. Create Test Customer
    const customer = await prisma.customer.create({
        data: {
            name: 'Test Customer ' + Date.now(),
            balance: 0
        }
    });
    const customerId = customer.id;
    console.log(`Step 1: Created Customer #${customerId}. Initial Balance: ${customer.balance}`);

    const getBalance = async () => {
        const c = await prisma.customer.findUnique({ where: { id: customerId } });
        return c.balance;
    };

    // 2. Simulate Sale (1000 EGP)
    const saleTotal = 1000;
    const sale = await prisma.sale.create({
        data: {
            customerId,
            total: saleTotal,
            saleType: 'آجل'
        }
    });
    
    await prisma.customerTransaction.create({
        data: {
            customerId,
            type: 'SALE',
            referenceType: 'SALE',
            referenceId: sale.id,
            debit: saleTotal,
            credit: 0,
            date: new Date()
        }
    });

    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { increment: saleTotal } }
    });

    console.log(`Step 2: Created Sale of ${saleTotal}. Current Balance: ${await getBalance()}`);

    // 3. Simulate Payment (400 EGP)
    const paymentAmount = 400;
    const payment = await prisma.customerPayment.create({
        data: {
            customerId,
            amount: paymentAmount,
            paymentDate: new Date(),
            paymentMethodId: 1
        }
    });

    await prisma.customerTransaction.create({
        data: {
            customerId,
            type: 'PAYMENT',
            referenceType: 'PAYMENT',
            referenceId: payment.id,
            debit: 0,
            credit: paymentAmount,
            date: new Date()
        }
    });

    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: paymentAmount } }
    });

    console.log(`Step 3: Created Payment of ${paymentAmount}. Current Balance: ${await getBalance()}`);

    // 4. Update Sale (Increase to 1500)
    const oldSaleTotal = 1000;
    const newSaleTotal = 1500;
    const saleDelta = newSaleTotal - oldSaleTotal;

    await prisma.sale.update({
        where: { id: sale.id },
        data: { total: newSaleTotal }
    });

    await prisma.customerTransaction.updateMany({
        where: { referenceType: 'SALE', referenceId: sale.id },
        data: { debit: newSaleTotal }
    });

    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { increment: saleDelta } }
    });

    console.log(`Step 4: Updated Sale to ${newSaleTotal} (Delta: +${saleDelta}). Current Balance: ${await getBalance()}`);

    // 5. Update Payment (Increase to 600)
    const oldPaymentAmount = 400;
    const newPaymentAmount = 600;
    const paymentDelta = newPaymentAmount - oldPaymentAmount;

    await prisma.customerPayment.update({
        where: { id: payment.id },
        data: { amount: newPaymentAmount }
    });

    await prisma.customerTransaction.updateMany({
        where: { referenceType: 'PAYMENT', referenceId: payment.id },
        data: { credit: newPaymentAmount }
    });

    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: paymentDelta } }
    });

    console.log(`Step 5: Updated Payment to ${newPaymentAmount} (Delta: +${paymentDelta}). Current Balance: ${await getBalance()}`);

    // 6. Cleanup
    await prisma.sale.delete({ where: { id: sale.id } });
    await prisma.customerTransaction.deleteMany({ where: { referenceType: 'SALE', referenceId: sale.id } });
    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: newSaleTotal } }
    });
    console.log(`Step 6: Deleted Sale. Current Balance: ${await getBalance()}`);

    await prisma.customerPayment.delete({ where: { id: payment.id } });
    await prisma.customerTransaction.deleteMany({ where: { referenceType: 'PAYMENT', referenceId: payment.id } });
    await prisma.customer.update({
        where: { id: customerId },
        data: { balance: { increment: newPaymentAmount } }
    });
    
    const finalBalance = await getBalance();
    console.log(`Step 7: Deleted Payment. Final Balance: ${finalBalance}`);

    if (Math.abs(finalBalance) < 0.01) {
        console.log('SUCCESS: Balance logic is consistent.');
    } else {
        console.log('WARNING: Final balance is not zero. Check logic.');
    }

    await prisma.customer.delete({ where: { id: customerId } });
}

testCustomerCycle()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());

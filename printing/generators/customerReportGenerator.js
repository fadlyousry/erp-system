/**
 * مولد تقرير العملاء المتأخرين
 */
export const generateOverdueReportHTML = (customers, threshold) => {
    const today = new Date().toLocaleDateString('ar-EG');
    
    const rows = customers.map((c, index) => {
        const lastPaymentDate = c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString('ar-EG') : 'لم يسدد أبداً';
        const lastPaymentAmount = c.lastPaymentAmount ? `${c.lastPaymentAmount.toLocaleString()} ج.م` : '-';
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${c.name}</td>
                <td>${c.phone || '-'}</td>
                <td style="color: #dc2626; font-weight: bold;">${(c.balance || 0).toLocaleString()} ج.م</td>
                <td style="color: #991b1b;">${c.lastPaymentDays || 0} يوم</td>
                <td style="font-size: 12px;">${lastPaymentDate}</td>
                <td style="font-size: 12px; font-weight: 600; color: #059669;">${lastPaymentAmount}</td>
            </tr>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
                .header h1 { margin: 0; color: #1e40af; font-size: 24px; }
                .header p { margin: 5px 0; color: #64748b; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f1f5f9; color: #475569; font-weight: bold; padding: 12px; border: 1px solid #e2e8f0; text-align: right; font-size: 13px; }
                td { padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; }
                tr:nth-child(even) { background-color: #f8fafc; }
                .footer { margin-top: 30px; text-align: left; font-size: 12px; color: #94a3b8; }
                .summary { margin-top: 20px; background: #f0f9ff; padding: 15px; border-radius: 8px; border: 1px solid #bae6fd; display: flex; justify-content: space-between; align-items: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>تقرير العملاء المتأخرين عن السداد</h1>
                <p>تاريخ التقرير: ${today}</p>
                <p>المعيار: عملاء لم يسددوا منذ أكثر من ${threshold} يوم</p>
            </div>

            <div class="summary">
                <div>
                    <strong>إجمالي المتأخرين:</strong>
                    <span>${customers.length} عميل</span>
                </div>
                <div>
                    <strong>إجمالي مبالغ المتأخرين:</strong>
                    <span style="color: #dc2626; font-weight: bold;">${customers.reduce((sum, c) => sum + (c.balance || 0), 0).toLocaleString()} ج.م</span>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>الاسم</th>
                        <th>الهاتف</th>
                        <th>الرصيد</th>
                        <th>التأخير</th>
                        <th>آخر دفعة</th>
                        <th>قيمة آخر دفعة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>

            <div class="footer">
                طبع بواسطة نظام FADL ERP في ${new Date().toLocaleString('ar-EG')}
            </div>
        </body>
        </html>
    `;
};

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { safeAlert } from '../../utils/safeAlert';
import {
    delimiter as detectImportDelimiter,
    parseLine as parseImportLine,
    toImportHeaders as toCustomerImportHeaders,
    buildCustomerImportAutoMapping,
    mapRowsWithCustomerImportMapping,
    sanitizeImportedCustomer,
    CUSTOMER_IMPORT_FIELD_OPTIONS
} from '../../utils/customerImportUtils';

const normalizeCustomerNameKey = (value) => String(value ?? '').trim().toLowerCase();
const normalizeCustomerPhoneKey = (value) => String(value ?? '')
    .replace(/[^\d+]/g, '')
    .trim();
const pickImportTextValue = (incomingValue, fallbackValue) => {
    const incoming = String(incomingValue ?? '').trim();
    if (incoming) return incoming;

    const fallback = String(fallbackValue ?? '').trim();
    return fallback || undefined;
};

const CustomerImportHandler = memo(function CustomerImportHandler({
    allCustomers,
    refreshCustomers,
    inputRef
}) {
    const [customerImportSession, setCustomerImportSession] = useState(null);
    const [importingCustomers, setImportingCustomers] = useState(false);
    const [updateExistingOnImport, setUpdateExistingOnImport] = useState(true);

    const customerImportColumnSamples = useMemo(() => {
        const sampleMap = new Map();
        if (!customerImportSession?.headers?.length || !customerImportSession?.rows?.length) return sampleMap;

        const previewRows = customerImportSession.rows.slice(0, 120);
        customerImportSession.headers.forEach((header) => {
            for (const row of previewRows) {
                const value = String(row?.[header.index] ?? '').trim();
                if (value) {
                    sampleMap.set(header.id, value.slice(0, 120));
                    break;
                }
            }
        });

        return sampleMap;
    }, [customerImportSession]);

    const closeCustomerImportSession = useCallback(() => {
        if (importingCustomers) return;
        setCustomerImportSession(null);
    }, [importingCustomers]);

    const updateCustomerImportFieldMapping = useCallback((fieldKey, columnId) => {
        setCustomerImportSession((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                mapping: {
                    ...prev.mapping,
                    [fieldKey]: columnId
                }
            };
        });
    }, []);

    const applyCustomerImportAutoMapping = useCallback(() => {
        setCustomerImportSession((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                mapping: buildCustomerImportAutoMapping(prev.headers)
            };
        });
    }, []);

    const parseDelimitedCustomerRows = useCallback((rawText) => {
        const lines = String(rawText || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length < 2) throw new Error('الملف لا يحتوي على بيانات كافية');

        const delim = detectImportDelimiter(lines[0]);
        const headers = toCustomerImportHeaders(parseImportLine(lines[0], delim));
        const rows = lines
            .slice(1)
            .map((line) => parseImportLine(line, delim))
            .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

        if (!headers.length) throw new Error('تعذر قراءة الأعمدة من الملف');
        if (!rows.length) throw new Error('الملف لا يحتوي على صفوف بيانات');

        return { headers, rows };
    }, []);

    const parseWorkbookCustomerRows = useCallback(async (file) => {
        const xlsxModule = await import('xlsx');
        const XLSX = xlsxModule?.default || xlsxModule;

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
            type: 'array',
            cellDates: false
        });

        const firstSheetName = workbook?.SheetNames?.[0];
        if (!firstSheetName) throw new Error('ملف Excel لا يحتوي على أي ورقة بيانات');

        const sheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: false
        });

        const rows = Array.isArray(matrix) ? matrix : [];
        const hasAnyValue = (row) => (
            Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
        );
        const firstNonEmptyIndex = rows.findIndex(hasAnyValue);

        if (firstNonEmptyIndex === -1) throw new Error('ورقة Excel فارغة');

        const headerRow = rows[firstNonEmptyIndex] || [];
        const dataRows = rows
            .slice(firstNonEmptyIndex + 1)
            .map((row) => (Array.isArray(row) ? row : []))
            .filter(hasAnyValue);

        const headers = toCustomerImportHeaders(headerRow);
        if (!headers.length) throw new Error('تعذر قراءة أعمدة ملف Excel');
        if (!dataRows.length) throw new Error('ورقة Excel لا تحتوي على بيانات');

        return { headers, rows: dataRows, sheetName: firstSheetName };
    }, []);

    const importCustomersFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            const fileName = String(file.name || '').toLowerCase();
            let parsed = null;

            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                parsed = await parseWorkbookCustomerRows(file);
            } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
                parsed = parseDelimitedCustomerRows(await file.text());
            } else {
                throw new Error('صيغة الملف غير مدعومة. استخدم Excel أو CSV أو TSV');
            }

            setCustomerImportSession({
                fileName: file.name,
                headers: parsed.headers,
                rows: parsed.rows,
                sheetName: parsed.sheetName || null,
                mapping: buildCustomerImportAutoMapping(parsed.headers)
            });
        } catch (err) {
            await safeAlert(err?.message || 'تعذر قراءة الملف', null, {
                type: 'error',
                title: 'استيراد العملاء'
            });
        }
    };

    const downloadCustomerImportTemplate = () => {
        const headers = [
            'name',
            'phone',
            'phone2',
            'address',
            'city',
            'district',
            'notes',
            'creditLimit',
            'balance',
            'customerType'
        ];
        const rows = [
            headers.join(','),
            [
                'عميل تجريبي',
                '01000000000',
                '',
                'القاهرة - شارع النصر',
                'القاهرة',
                'مدينة نصر',
                'ملاحظة اختيارية',
                '5000',
                '1250',
                'VIP'
            ].join(',')
        ];

        const blob = new Blob([`\uFEFF${rows.join('\r\n')}`], {
            type: 'text/csv;charset=utf-8;'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'customers-import-template.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    const startCustomerImport = useCallback(async () => {
        if (!customerImportSession || importingCustomers) return;

        if (!customerImportSession.mapping?.name) {
            await safeAlert('اختَر عمود "اسم العميل" قبل بدء الاستيراد', null, {
                type: 'warning',
                title: 'مطابقة الأعمدة'
            });
            return;
        }

        setImportingCustomers(true);
        try {
            const mappedRows = mapRowsWithCustomerImportMapping(
                customerImportSession.rows,
                customerImportSession.mapping
            ).map((mapped, index) => ({
                sourceIndex: index + 2,
                customer: sanitizeImportedCustomer(mapped)
            }));

            const validRows = mappedRows.filter((item) => item.customer.name);
            const skipped = Math.max(0, mappedRows.length - validRows.length);

            if (!validRows.length) {
                throw new Error('لم يتم العثور على صفوف صالحة تحتوي على اسم عميل');
            }

            const existingByName = new Map();
            const existingByPhone = new Map();
            if (updateExistingOnImport) {
                for (const customer of allCustomers) {
                    const nameKey = normalizeCustomerNameKey(customer?.name);
                    const phoneKey = normalizeCustomerPhoneKey(customer?.phone);
                    if (nameKey && !existingByName.has(nameKey)) existingByName.set(nameKey, customer);
                    if (phoneKey && !existingByPhone.has(phoneKey)) existingByPhone.set(phoneKey, customer);
                }
            }

            let created = 0;
            let updated = 0;
            let failed = 0;
            const rowErrors = [];

            for (const item of validRows) {
                const row = item.customer;
                const nameKey = normalizeCustomerNameKey(row.name);
                const phoneKey = normalizeCustomerPhoneKey(row.phone);

                try {
                    let existingCustomer = null;
                    if (updateExistingOnImport) {
                        if (phoneKey) existingCustomer = existingByPhone.get(phoneKey) || null;
                        if (!existingCustomer && nameKey) existingCustomer = existingByName.get(nameKey) || null;
                    }

                    if (existingCustomer) {
                        const rawUpdatePayload = {
                            name: pickImportTextValue(row.name, existingCustomer.name),
                            phone: pickImportTextValue(row.phone, existingCustomer.phone),
                            phone2: pickImportTextValue(row.phone2, existingCustomer.phone2),
                            address: pickImportTextValue(row.address, existingCustomer.address),
                            city: pickImportTextValue(row.city, existingCustomer.city),
                            district: pickImportTextValue(row.district, existingCustomer.district),
                            notes: pickImportTextValue(row.notes, existingCustomer.notes),
                            customerType: pickImportTextValue(row.customerType, existingCustomer.customerType),
                            ...(Number.isFinite(row.creditLimit)
                                ? { creditLimit: row.creditLimit }
                                : {}),
                            ...(Number.isFinite(row.balance)
                                ? { balance: row.balance }
                                : {})
                        };
                        const updatePayload = Object.fromEntries(
                            Object.entries(rawUpdatePayload).filter(([, value]) => value !== undefined)
                        );
                        const updateResult = await window.api.updateCustomer(existingCustomer.id, updatePayload);
                        if (updateResult?.error) throw new Error(updateResult.error);

                        updated += 1;
                        const mergedCustomer = { ...existingCustomer, ...updatePayload };
                        const mergedNameKey = normalizeCustomerNameKey(mergedCustomer.name);
                        const mergedPhoneKey = normalizeCustomerPhoneKey(mergedCustomer.phone);
                        if (mergedNameKey) existingByName.set(mergedNameKey, mergedCustomer);
                        if (mergedPhoneKey) existingByPhone.set(mergedPhoneKey, mergedCustomer);
                    } else {
                        const addResult = await window.api.addCustomer({
                            ...row,
                            customerType: row.customerType || 'عادي'
                        });
                        if (addResult?.error) throw new Error(addResult.error);

                        created += 1;
                        const inserted = { ...row, ...(addResult || {}) };
                        const insertedNameKey = normalizeCustomerNameKey(inserted.name);
                        const insertedPhoneKey = normalizeCustomerPhoneKey(inserted.phone);
                        if (insertedNameKey) existingByName.set(insertedNameKey, inserted);
                        if (insertedPhoneKey) existingByPhone.set(insertedPhoneKey, inserted);
                    }
                } catch (rowError) {
                    failed += 1;
                    if (rowErrors.length < 10) {
                        rowErrors.push(`صف ${item.sourceIndex}: ${rowError?.message || 'خطأ غير متوقع'}`);
                    }
                }
            }

            await refreshCustomers();
            setCustomerImportSession(null);

            await safeAlert(
                `نتيجة الاستيراد:\nجديد: ${created}\nتم تحديثه: ${updated}\nتم تجاهله (بدون اسم): ${skipped}\nفشل: ${failed}`,
                null,
                {
                    type: failed > 0 ? 'warning' : 'success',
                    title: 'استيراد العملاء',
                    detail: rowErrors.length ? rowErrors.join('\n') : undefined
                }
            );
        } catch (err) {
            await safeAlert(err?.message || 'تعذر استيراد العملاء', null, {
                type: 'error',
                title: 'استيراد العملاء'
            });
        } finally {
            setImportingCustomers(false);
        }
    }, [customerImportSession, importingCustomers, updateExistingOnImport, allCustomers, refreshCustomers]);


    return (
        <>
            {/* مدخل مخفي لاختيار الملف */}
            <input
                type="file"
                ref={inputRef}
                onChange={importCustomersFile}
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
            />

            {/* زر تحميل القالب */}
            <button
                onClick={downloadCustomerImportTemplate}
                style={{
                    display: 'none' // Can be styled and exposed if needed, or called externally. For now keep functional.
                }}
                id="hidden-download-template-btn"
            >
                تحميل القالب
            </button>

            {/* Customer Import Details Modal */}
            {
                customerImportSession && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1400
                        }}
                        onClick={closeCustomerImportSession}
                    >
                        <div
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '12px',
                                padding: '24px',
                                width: 'min(920px, calc(100vw - 40px))',
                                maxHeight: '90vh',
                                overflowY: 'auto'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 style={{ marginBottom: '5px', color: '#1f2937' }}>📥 استيراد بيانات العملاء</h2>
                            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
                                ملف: <strong style={{ color: '#374151' }}>{customerImportSession.fileName}</strong>
                                {customerImportSession.sheetName && ` - ورقة: ${customerImportSession.sheetName}`}
                                <span style={{ margin: '0 8px' }}>|</span>
                                الصفوف: <strong style={{ color: '#374151' }}>{customerImportSession.rows.length}</strong> صف بيانات
                            </p>

                            <div style={{
                                backgroundColor: '#f9fafb',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                padding: '15px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                    <h3 style={{ margin: '0', color: '#374151', fontSize: '16px' }}>مطابقة الأعمدة</h3>
                                    <button
                                        onClick={applyCustomerImportAutoMapping}
                                        style={{
                                            padding: '6px 12px',
                                            backgroundColor: '#e0f2fe',
                                            color: '#0284c7',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✨ محاولة الربط التلقائي
                                    </button>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                    gap: '15px'
                                }}>
                                    {CUSTOMER_IMPORT_FIELD_OPTIONS.map((field) => (
                                        <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{
                                                fontSize: '13px',
                                                fontWeight: 'bold',
                                                color: field.required ? '#dc2626' : '#4b5563',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                {field.label}
                                                {field.required && <span title="مطلوب">*</span>}
                                                {field.help && (
                                                    <span title={field.help} style={{ cursor: 'help', color: '#9ca3af', fontSize: '12px' }}>
                                                        ⓘ
                                                    </span>
                                                )}
                                            </label>
                                            <select
                                                value={customerImportSession.mapping?.[field.id] || ''}
                                                onChange={(e) => updateCustomerImportFieldMapping(field.id, e.target.value)}
                                                style={{
                                                    padding: '8px',
                                                    border: `1px solid ${field.required && !customerImportSession.mapping?.[field.id] ? '#fca5a5' : '#d1d5db'}`,
                                                    borderRadius: '6px',
                                                    fontSize: '14px',
                                                    width: '100%'
                                                }}
                                            >
                                                <option value="">-- تجاهل --</option>
                                                {customerImportSession.headers.map((h) => {
                                                    const sample = customerImportColumnSamples.get(h.id);
                                                    return (
                                                        <option key={h.id} value={h.id}>
                                                            {h.label} {sample ? `(مثال: ${sample.slice(0, 20)}${sample.length > 20 ? '...' : ''})` : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '25px', padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={updateExistingOnImport}
                                    onChange={(e) => setUpdateExistingOnImport(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                                />
                                <span style={{ fontSize: '14px', color: '#166534', fontWeight: 'bold' }}>
                                    تحديث بيانات العملاء الموجودين مسبقاً (مطابقة برقم الهاتف أو الاسم التابع)
                                </span>
                            </label>

                            <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', paddingTop: '15px', borderTop: '1px solid #e5e7eb' }}>
                                <button
                                    onClick={closeCustomerImportSession}
                                    disabled={importingCustomers}
                                    style={{
                                        padding: '10px 20px',
                                        backgroundColor: 'white',
                                        color: '#4b5563',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontWeight: 'bold',
                                        cursor: importingCustomers ? 'wait' : 'pointer'
                                    }}
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={startCustomerImport}
                                    disabled={importingCustomers || !customerImportSession.mapping?.name}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: !customerImportSession.mapping?.name ? '#9ca3af' : '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: 'bold',
                                        cursor: importingCustomers ? 'wait' : (!customerImportSession.mapping?.name ? 'not-allowed' : 'pointer'),
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {importingCustomers ? '⏳ جاري الاستيراد...' : '🚀 بدء الاستيراد'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
});

export default CustomerImportHandler;

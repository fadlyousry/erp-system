import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Save, Pencil, Trash2, Box, Power, List, Printer, Warehouse, Search, Check, CheckCircle } from 'lucide-react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';
import { getDefaultPrinterName } from '../utils/appSettings';
import './Warehouses.css';

const DEFAULT_WAREHOUSE = {
  name: '',
  color: '#0f766e',
  isActive: true
};

const COLOR_PALETTE = [
  '#0f766e', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', 
  '#f59e0b', '#475569', '#06b6d4', '#6366f1', '#ec4899'
];

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState(DEFAULT_WAREHOUSE);
  const [editingId, setEditingId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  // Inventory Modal State
  const [selectedWarehouseForInventory, setSelectedWarehouseForInventory] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [actualQuantities, setActualQuantities] = useState({});
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.api.getWarehouses();
      if (res?.error) throw new Error(res.error);
      setWarehouses(Array.isArray(res) ? res : []);
    } catch (err) {
      await safeAlert(err.message || 'فشل تحميل المخازن', null, { type: 'error', title: 'المخازن' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const handleOpenAdd = () => {
    setWarehouseForm(DEFAULT_WAREHOUSE);
    setEditingId(null);
    setShowFormModal(true);
  };

  const handleSave = async () => {
    const name = (warehouseForm.name || '').trim();
    if (!name) {
      await safeAlert('اسم المخزن مطلوب', null, { type: 'warning', title: 'بيانات ناقصة' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        color: warehouseForm.color || '#0f766e',
        isActive: warehouseForm.isActive !== false
      };

      const res = editingId
        ? await window.api.updateWarehouse(editingId, payload)
        : await window.api.addWarehouse(payload);

      if (res?.error) throw new Error(res.error);

      setShowFormModal(false);
      setWarehouseForm(DEFAULT_WAREHOUSE);
      setEditingId(null);
      await loadWarehouses();
      notify(editingId ? 'تم تحديث المخزن بنجاح' : 'تم إضافة المخزن بنجاح', 'success');
    } catch (err) {
      await safeAlert(err.message || 'فشل حفظ المخزن', null, { type: 'error', title: 'المخازن' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (warehouse) => {
    setWarehouseForm({
      name: warehouse.name || '',
      color: warehouse.color || '#0f766e',
      isActive: warehouse.isActive !== false
    });
    setEditingId(warehouse.id);
    setShowFormModal(true);
  };

  const handleCancel = () => {
    setShowFormModal(false);
    setWarehouseForm(DEFAULT_WAREHOUSE);
    setEditingId(null);
  };

  const handleDelete = async (id, name) => {
    const ok = await safeConfirm(`سيتم حذف المخزن "${name}". هل تريد المتابعة؟`, { title: 'حذف مخزن' });
    if (!ok) return;

    try {
      const res = await window.api.deleteWarehouse(id);
      if (res?.error) {
        await safeAlert(res.error, null, { type: 'error', title: 'تعذر الحذف' });
        return;
      }

      await loadWarehouses();
      notify('تم حذف المخزن', 'success');
    } catch (err) {
      await safeAlert(err.message || 'فشل حذف المخزن', null, { type: 'error', title: 'المخازن' });
    }
  };

  const handleToggleActive = async (warehouse) => {
    try {
      const res = await window.api.updateWarehouse(warehouse.id, {
        ...warehouse,
        isActive: !warehouse.isActive
      });
      if (res?.error) throw new Error(res.error);
      await loadWarehouses();
      notify(warehouse.isActive ? 'تم تعطيل المخزن' : 'تم تفعيل المخزن', 'success');
    } catch (err) {
      await safeAlert(err.message || 'فشل تحديث حالة المخزن', null, { type: 'error', title: 'المخازن' });
    }
  };

  const handleOpenInventory = async (warehouse) => {
    setSelectedWarehouseForInventory(warehouse);
    setInventoryLoading(true);
    setActualQuantities({});
    setInventorySearchQuery('');
    setShowOnlyDiscrepancies(false);
    try {
      const res = await window.api.getWarehouseInventory(warehouse.id);
      if (res?.error) throw new Error(res.error);
      setInventoryItems(Array.isArray(res) ? res : []);

      const initialCounts = {};
      (Array.isArray(res) ? res : []).forEach(item => {
        initialCounts[item.id] = item.quantity;
      });
      setActualQuantities(initialCounts);
    } catch (err) {
      await safeAlert(err.message || 'فشل تحميل جرد المخزن', null, { type: 'error', title: 'جرد المخزن' });
    } finally {
      setInventoryLoading(false);
    }
  };

  const handleCloseInventory = () => {
    setSelectedWarehouseForInventory(null);
    setInventoryItems([]);
    setInventorySearchQuery('');
    setShowOnlyDiscrepancies(false);
  };

  const handleActualQuantityChange = (itemId, value) => {
    const val = value === '' ? 0 : parseInt(value);
    setActualQuantities(prev => ({ ...prev, [itemId]: isNaN(val) ? 0 : Math.max(0, val) }));
  };

  const handleMatchAll = () => {
    const matched = {};
    inventoryItems.forEach(item => {
      matched[item.id] = item.quantity;
    });
    setActualQuantities(matched);
  };

  const handleZeroAll = () => {
    const zeroed = {};
    inventoryItems.forEach(item => {
      zeroed[item.id] = 0;
    });
    setActualQuantities(zeroed);
  };

  const handleSaveReconciliation = async () => {
    if (!selectedWarehouseForInventory) return;

    const ok = await safeConfirm('هل أنت متأكد من رغبتك في تأكيد وتسوية الجرد؟ سيتم تعديل كميات المنتجات في قاعدة البيانات وتحديث الرصيد الدفتري فوراً.', { title: 'تأكيد تسوية وجرد المخزن' });
    if (!ok) return;

    setReconciling(true);
    try {
      const payload = inventoryItems.map(item => {
        const actualQty = actualQuantities[item.id] ?? item.quantity;
        return {
          variantId: item.variantId || null,
          productId: item.productId || item.variant?.productId || null,
          actualQty: actualQty
        };
      });

      const res = await window.api.reconcileWarehouseInventory(selectedWarehouseForInventory.id, payload);
      if (res?.error) throw new Error(res.error);

      notify('تمت تسوية وجرد كميات المخزن بنجاح', 'success');
      handleCloseInventory();
      await loadWarehouses();
    } catch (err) {
      await safeAlert(err.message || 'فشل تسوية المخزن', null, { type: 'error', title: 'تسوية الجرد' });
    } finally {
      setReconciling(false);
    }
  };

  const handlePrintInventoryReport = () => {
    if (!selectedWarehouseForInventory || inventoryItems.length === 0) return;

    const itemsToPrint = filteredInventoryItems;
    if (itemsToPrint.length === 0) {
      safeAlert('لا توجد بيانات لطباعتها بناءً على البحث والفلترة الحالية.', null, { type: 'warning', title: 'تنبيه الطباعة' });
      return;
    }

    const totalItems = itemsToPrint.length;
    let matchedCount = 0;
    let deficitCount = 0;
    let surplusCount = 0;

    const rowsHtml = itemsToPrint.map((item, idx) => {
      const productName = item.variant?.product?.name || item.product?.name || 'صنف غير معروف';
      const variantDetails = item.variant && (item.variant.productSize || item.variant.color)
        ? ` (${[item.variant.productSize, item.variant.color].filter(Boolean).join(' - ')})`
        : '';
      const barcode = item.variant?.barcode || item.product?.barcode || '-';
      const bookQty = item.quantity;
      const actualQty = actualQuantities[item.id] ?? item.quantity;
      const diff = actualQty - bookQty;

      let diffText = 'متطابق';
      let diffClass = 'diff-match';
      if (diff > 0) {
        diffText = `+${diff} (زيادة)`;
        diffClass = 'diff-surplus';
        surplusCount++;
      } else if (diff < 0) {
        diffText = `${diff} (عجز)`;
        diffClass = 'diff-deficit';
        deficitCount++;
      } else {
        matchedCount++;
      }

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>
            <div class="product-name">${productName}</div>
            ${variantDetails ? `<div class="variant-details">${variantDetails}</div>` : ''}
          </td>
          <td style="text-align: center; font-family: monospace;">${barcode}</td>
          <td style="text-align: center; font-weight: bold;">${bookQty}</td>
          <td style="text-align: center; font-weight: bold;">${actualQty}</td>
          <td style="text-align: center;">
            <span class="badge ${diffClass}">${diffText}</span>
          </td>
        </tr>
      `;
    }).join('');

    const formattedDate = new Date().toLocaleString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير جرد المخزن - ${selectedWarehouseForInventory.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Cairo', sans-serif;
    }
    
    body {
      padding: 30px;
      background-color: #ffffff;
      color: #1e293b;
      font-size: 12px;
      line-height: 1.5;
    }
    
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    
    .company-info {
      text-align: right;
    }
    
    .company-name {
      font-size: 16px;
      font-weight: 800;
      color: #0f766e;
    }
    
    .system-title {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    
    .report-title-container {
      text-align: center;
    }
    
    .report-title {
      font-size: 20px;
      font-weight: 800;
      color: #1e293b;
      letter-spacing: -0.5px;
    }
    
    .report-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    
    .date-info {
      text-align: left;
      font-size: 11px;
      color: #64748b;
    }
    
    .warehouse-badge {
      display: inline-block;
      background: #eff6ff;
      color: #2563eb;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 700;
      margin-top: 5px;
      border: 1px solid #bfdbfe;
    }

    .kpi-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 25px;
    }
    
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    
    .kpi-value {
      font-size: 18px;
      font-weight: 800;
      color: #0f766e;
    }
    
    .kpi-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-top: 2px;
    }
    
    .kpi-card.surplus .kpi-value { color: #16a34a; }
    .kpi-card.deficit .kpi-value { color: #dc2626; }
    .kpi-card.match .kpi-value { color: #2563eb; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    th {
      background-color: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: right;
      padding: 10px 8px;
      font-size: 12px;
      border: 1px solid #cbd5e1;
    }
    
    td {
      padding: 10px 8px;
      border: 1px solid #cbd5e1;
      font-size: 12px;
      vertical-align: middle;
    }
    
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    
    .product-name {
      font-weight: 700;
      color: #1e293b;
    }
    
    .variant-details {
      font-size: 10px;
      color: #0284c7;
      font-weight: 600;
      margin-top: 2px;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }
    
    .diff-match {
      background-color: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    
    .diff-surplus {
      background-color: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    
    .diff-deficit {
      background-color: #fff1f2;
      color: #be123c;
      border: 1px solid #fecdd3;
    }
    
    .signatures-section {
      margin-top: 50px;
      display: flex;
      justify-content: space-between;
      gap: 40px;
      page-break-inside: avoid;
    }
    
    .signature-box {
      flex: 1;
      border-top: 1px dashed #cbd5e1;
      padding-top: 10px;
      text-align: center;
      font-size: 11px;
      color: #475569;
      font-weight: 600;
    }
    
    .signature-line {
      margin-top: 30px;
      color: #94a3b8;
    }

    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none;
      }
      table {
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>

  <div class="report-header">
    <div class="company-info">
      <div class="company-name">مؤسسة الأعمال الراقية</div>
      <div class="system-title">نظام إدارة الموارد المؤسسية (ERP)</div>
    </div>
    
    <div class="report-title-container">
      <div class="report-title">تقرير جرد المخزن الفعلي</div>
      <div class="report-meta">
        مخزن: <span class="warehouse-badge">${selectedWarehouseForInventory.name}</span>
      </div>
    </div>
    
    <div class="date-info">
      <div>تاريخ إصدار التقرير:</div>
      <div style="font-weight: bold; margin-top: 4px; color: #1e293b;">${formattedDate}</div>
    </div>
  </div>

  <div class="kpi-container">
    <div class="kpi-card">
      <div class="kpi-value">${totalItems}</div>
      <div class="kpi-label">إجمالي بنود الجرد</div>
    </div>
    <div class="kpi-card match">
      <div class="kpi-value">${matchedCount}</div>
      <div class="kpi-label">الأصناف المتطابقة</div>
    </div>
    <div class="kpi-card deficit">
      <div class="kpi-value">${deficitCount}</div>
      <div class="kpi-label">الأصناف التي بها عجز</div>
    </div>
    <div class="kpi-card surplus">
      <div class="kpi-value">${surplusCount}</div>
      <div class="kpi-label">الأصناف التي بها زيادة</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 50px; text-align: center;">#</th>
        <th>اسم المنتج / الصنف</th>
        <th style="width: 140px; text-align: center;">الباركود</th>
        <th style="width: 100px; text-align: center;">الرصيد الدفتري</th>
        <th style="width: 100px; text-align: center;">الرصيد الفعلي</th>
        <th style="width: 130px; text-align: center;">الفروقات والتسوية</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="signatures-section">
    <div class="signature-box">
      <div>أمين المستودع المسؤول</div>
      <div class="signature-line">التوقيع: ....................................</div>
    </div>
    <div class="signature-box">
      <div>المسؤول عن جرد المطابقة</div>
      <div class="signature-line">التوقيع: ....................................</div>
    </div>
    <div class="signature-box">
      <div>الاعتماد المالي / الحسابات</div>
      <div class="signature-line">التوقيع والختم: ....................................</div>
    </div>
  </div>

</body>
</html>`;

    const defaultPrinter = getDefaultPrinterName();
    window.api.printPreviewHTML?.({
      html,
      title: `تقرير جرد - ${selectedWarehouseForInventory.name}`,
      printerName: defaultPrinter
    });
  };

  // Filter and search items
  const filteredInventoryItems = inventoryItems.filter(item => {
    const productName = (item.variant?.product?.name || item.product?.name || 'صنف غير معروف').toLowerCase();
    const barcode = (item.variant?.barcode || item.variant?.product?.barcode || item.product?.barcode || '').toLowerCase();
    const query = inventorySearchQuery.trim().toLowerCase();
    
    // Search filter
    const matchesSearch = productName.includes(query) || barcode.includes(query);
    if (!matchesSearch) return false;
    
    // Discrepancy filter
    if (showOnlyDiscrepancies) {
      const actual = actualQuantities[item.id] ?? item.quantity;
      const book = item.quantity;
      return actual !== book;
    }
    
    return true;
  });

  return (
    <div className="warehouses-page">
      <header className="warehouses-header">
        <div>
          <h1>
            <div className="warehouses-header-icon"><Warehouse size={20} /></div>
            إدارة المخازن
          </h1>
          <p>التحكم الكامل في المخازن وإدارة جرد المحتويات</p>
        </div>

        <div className="warehouses-header-actions">
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Warehouse size={18} /> إضافة مخزن جديد
          </button>
        </div>
      </header>

      <div className="warehouses-stats">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><List size={20} /></div>
          <div className="stat-info">
            <div className="stat-label">إجمالي المخازن</div>
            <div className="stat-value">{warehouses.length}</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><Warehouse size={20} /></div>
          <div className="stat-info">
            <div className="stat-label">المخازن النشطة</div>
            <div className="stat-value">{warehouses.filter(w => w.isActive).length}</div>
          </div>
        </div>
      </div>

      <section className="warehouses-table-card">
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center' }}><div className="loading-spinner" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>المخزن</th>
                  <th style={{ textAlign: 'center' }}>الحالة</th>
                  <th style={{ textAlign: 'center' }}>الجرد</th>
                  <th style={{ textAlign: 'center' }}>التحكم</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} style={{ opacity: w.isActive ? 1 : 0.6 }}>
                    <td>
                      <div className="warehouse-name-cell">
                        <div className="warehouse-color-indicator" style={{ background: w.color || '#0f766e' }} />
                        <div className="warehouse-title">
                          <strong>{w.name}</strong>
                          <span>ID: {String(w.id).substring(0, 6)}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-badge ${w.isActive ? 'status-active' : 'status-inactive'}`}>
                        {w.isActive ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => handleOpenInventory(w)} className="btn-inventory">
                        <Box size={14} /> جرد المحتويات
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="actions-cell">
                        <button onClick={() => handleToggleActive(w)} className={`action-btn btn-toggle ${w.isActive ? 'active' : ''}`} title={w.isActive ? 'تعطيل المخزن' : 'تفعيل المخزن'}>
                          <Power size={14} />
                        </button>
                        <button onClick={() => handleEdit(w)} className="action-btn btn-edit" title="تعديل">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(w.id, w.name)} className="action-btn btn-delete" title="حذف">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {warehouses.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>لا يوجد مخازن مضافة حالياً.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Warehouse Modal */}
      {showFormModal && (
        <div className="modern-modal-overlay" onClick={handleCancel}>
          <div className="modern-modal" onClick={e => e.stopPropagation()}>
            <header className="modern-modal-header">
              <div>
                <h2>{editingId ? 'تعديل بيانات المخزن' : 'إضافة مخزن جديد'}</h2>
                <p>أدخل البيانات الأساسية للمخزن وتعديل حالته التشغيلية</p>
              </div>
              <button onClick={handleCancel} className="close-btn-circle"><X size={20} /></button>
            </header>
            <div className="modern-modal-body">
              <div className="form-section">
                <div className="input-group">
                  <label>اسم المخزن</label>
                  <input type="text" value={warehouseForm.name} onChange={(e) => setWarehouseForm((p) => ({ ...p, name: e.target.value }))} placeholder="مثال: المخزن الرئيسي" autoFocus />
                </div>
                <div className="input-group">
                  <label>اللون المميز للمخزن</label>
                  <div className="color-palette">
                    {COLOR_PALETTE.map(color => (
                      <div key={color} className={`color-item ${warehouseForm.color === color ? 'selected' : ''}`} onClick={() => setWarehouseForm(p => ({ ...p, color: color }))}>
                        <div className="color-box" style={{ backgroundColor: color }}></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="wh-toggle-card">
                  <span style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b' }}>حالة المخزن (نشط / معطل)</span>
                  <div className={`wh-toggle-switch ${warehouseForm.isActive ? 'active' : ''}`} onClick={() => setWarehouseForm(p => ({ ...p, isActive: !p.isActive }))} />
                </div>
              </div>
            </div>
            <footer className="modern-modal-footer">
              <button type="button" onClick={handleCancel} className="btn btn-light" disabled={saving}>إلغاء</button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
                <Save size={16} /> 
                {saving ? 'جاري الحفظ...' : editingId ? 'تحديث البيانات' : 'إضافة المخزن'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Inventory Modal (Jard) */}
      {selectedWarehouseForInventory && (
        <div className="modern-modal-overlay" onClick={handleCloseInventory}>
          <div className="modern-modal" onClick={e => e.stopPropagation()} style={{ width: '95%', maxWidth: '900px' }}>
            <header className="modern-modal-header">
              <div>
                <h2>جرد محتويات المخزن وتصفية الأرصدة</h2>
                <p>مخزن: {selectedWarehouseForInventory.name}</p>
              </div>
              <button onClick={handleCloseInventory} className="close-btn-circle"><X size={20} /></button>
            </header>
            <div className="modern-modal-body" style={{ background: '#fff', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Search & Filter Toolbar */}
              <div className="jard-toolbar">
                <div className="jard-search-wrapper">
                  <Search size={16} className="search-icon-inside" />
                  <input 
                    type="text" 
                    placeholder="ابحث باسم المنتج أو الباركود..." 
                    value={inventorySearchQuery}
                    onChange={(e) => setInventorySearchQuery(e.target.value)}
                    className="jard-search-input"
                  />
                </div>
                
                <label className="jard-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={showOnlyDiscrepancies}
                    onChange={(e) => setShowOnlyDiscrepancies(e.target.checked)}
                  />
                  <span>إظهار الفروقات فقط (عجز / زيادة)</span>
                </label>
              </div>

              {/* Quick Actions Panel */}
              <div className="jard-quick-actions">
                <span className="jard-actions-title">إجراءات سريعة:</span>
                <button type="button" onClick={handleMatchAll} className="btn-action-shortcut btn-shortcut-match" disabled={inventoryLoading || inventoryItems.length === 0}>
                  <CheckCircle size={13} /> تطابق الكل مع الدفتري
                </button>
                <button type="button" onClick={handleZeroAll} className="btn-action-shortcut btn-shortcut-zero" disabled={inventoryLoading || inventoryItems.length === 0}>
                  <X size={13} /> تصفير كل الكميات الفعلية
                </button>
              </div>

              {inventoryLoading ? (
                <div style={{ padding: '80px', textAlign: 'center' }}><div className="loading-spinner" /></div>
              ) : (
                <div className="table-wrapper" style={{ maxHeight: '45vh', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                  <table className="modern-table" style={{ borderCollapse: 'separate' }}>
                    <thead>
                      <tr>
                        <th>المنتج / الصنف</th>
                        <th style={{ textAlign: 'center' }}>الرصيد الدفتري</th>
                        <th style={{ textAlign: 'center' }}>الرصيد الفعلي</th>
                        <th style={{ textAlign: 'center' }}>الفرق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventoryItems.map(item => {
                        const productName = item.variant?.product?.name || item.product?.name || 'صنف غير معروف';
                        const variantDetails = item.variant && (item.variant.productSize || item.variant.color)
                          ? ` (${[item.variant.productSize, item.variant.color].filter(Boolean).join(' - ')})`
                          : '';
                        const bookQty = item.quantity;
                        const actualQty = actualQuantities[item.id] ?? item.quantity;
                        const diff = actualQty - bookQty;

                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: '700', fontSize: '13px', color: '#1e293b' }}>
                                {productName}
                                {variantDetails && <span style={{ fontWeight: '600', color: '#0284c7', fontSize: '11px', marginRight: '6px' }}>{variantDetails}</span>}
                              </div>
                              {(item.variant?.barcode || item.product?.barcode) && (
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                                  الباركود: {item.variant?.barcode || item.product?.barcode}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: '800', color: '#475569', fontSize: '14px' }}>
                              {bookQty}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="number" 
                                min="0"
                                value={actualQuantities[item.id] ?? ''} 
                                onChange={(e) => handleActualQuantityChange(item.id, e.target.value)} 
                                style={{ width: '90px', height: '32px', textAlign: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontWeight: '800', fontSize: '13px' }} 
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {diff === 0 ? (
                                <span className="discrepancy-badge discrepancy-match">
                                  <Check size={12} style={{ strokeWidth: 3 }} /> متطابق
                                </span>
                              ) : diff > 0 ? (
                                <span className="discrepancy-badge discrepancy-surplus">
                                  +{diff} (زيادة)
                                </span>
                              ) : (
                                <span className="discrepancy-badge discrepancy-deficit">
                                  {diff} (عجز)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredInventoryItems.length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>لا يوجد بضائع تطابق البحث أو خيارات الفلترة المحددة.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <footer className="modern-modal-footer" style={{ justifyContent: 'space-between' }}>
              <button onClick={handlePrintInventoryReport} className="btn btn-secondary" disabled={inventoryLoading || inventoryItems.length === 0}>
                <Printer size={16} /> طباعة تقرير الجرد
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={handleCloseInventory} className="btn btn-light" disabled={reconciling}>إلغاء</button>
                <button type="button" onClick={handleSaveReconciliation} disabled={reconciling || inventoryLoading || inventoryItems.length === 0} className="btn btn-primary" style={{ background: '#1e293b' }}>
                  <Save size={16} /> 
                  {reconciling ? 'جاري الحفظ والتسوية...' : 'تأكيد وتسوية الجرد'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {toast && (
        <div className="products-toast">
          {toast.message}
        </div>
      )}
    </div>
  );
}

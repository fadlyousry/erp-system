import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Barcode, Trash2, X, AlertCircle, Warehouse, Hourglass, Loader2, CheckCircle2, ChevronDown, TableProperties } from 'lucide-react';
import './BulkProductModal.css';

const DEFAULT_UNITS = ['قطعة', 'كرتونة', 'علبة', 'كيلو', 'لتر', 'متر', 'جرام', 'رزمة'];

const nText = (v) => String(v ?? '').trim();
const money = (v) => {
  const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Number(Math.max(0, n).toFixed(2)) : 0;
};

const calcEan13CheckDigit = (code12) => {
  const digits = String(code12).replace(/\D/g, '').padStart(12, '0').slice(0, 12).split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + (i % 2 === 0 ? d : d * 3), 0);
  return (10 - (sum % 10)) % 10;
};

const makeEan13 = () => {
  const a = Date.now().toString().slice(-5);
  const b = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  const code12 = `20${a}${b}`;
  return `${code12}${calcEan13CheckDigit(code12)}`;
};

const makeSku = (name = '') => {
  const prefix = nText(name)
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p.slice(0, 3).toUpperCase())
    .join('-');
  const stamp = Date.now().toString().slice(-6);
  return `${prefix || 'PRD'}-${stamp}`;
};

const INITIAL_ROW_COUNT = 5;

const makeEmptyRow = () => ({
  _id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  categoryId: '',
  unitName: 'قطعة',
  purchasePrice: '',
  salePrice: '',
  wholesalePrice: '',
  quantity: '',
  barcode: '',
  status: 'pending', // pending | saving | saved | error
  errorMsg: ''
});

export default function BulkProductModal({
  isOpen,
  onClose,
  onComplete,
  categories = [],
  warehouses = []
}) {
  const [rows, setRows] = useState(() => Array.from({ length: INITIAL_ROW_COUNT }, makeEmptyRow));
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [alertMsg, setAlertMsg] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [profitMargin, setProfitMargin] = useState('');
  const [wholesaleProfitMargin, setWholesaleProfitMargin] = useState('');
  const tableRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setRows(Array.from({ length: INITIAL_ROW_COUNT }, makeEmptyRow));
      setIsSaving(false);
      setProgress({ current: 0, total: 0 });
      setAlertMsg('');
      setSelectedWarehouseId(warehouses.length > 0 ? String(warehouses[0].id) : '');
      setProfitMargin('');
      setWholesaleProfitMargin('');
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSaving, onClose]);

  const updateRow = useCallback((rowId, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== rowId) return r;
        const updated = { ...r, [field]: value };
        if (r.status === 'error') {
          updated.status = 'pending';
        }

        // Apply profit margins automatically when updating purchasePrice
        if (field === 'purchasePrice') {
          const cost = Number.parseFloat(value);
          if (Number.isFinite(cost) && cost > 0) {
            const margin = Number.parseFloat(profitMargin);
            if (Number.isFinite(margin) && margin >= 0) {
              updated.salePrice = String(money(cost * (1 + margin / 100)));
            }
            const whMargin = Number.parseFloat(wholesaleProfitMargin);
            if (Number.isFinite(whMargin) && whMargin >= 0) {
              updated.wholesalePrice = String(money(cost * (1 + whMargin / 100)));
            }
          }
        }
        return updated;
      })
    );
  }, [profitMargin, wholesaleProfitMargin]);

  const handleProfitMarginChange = useCallback((marginVal) => {
    setProfitMargin(marginVal);
    const margin = Number.parseFloat(marginVal);
    if (!Number.isFinite(margin) || margin < 0) return;

    setRows((prev) =>
      prev.map((r) => {
        if (r.status === 'saved') return r;
        const cost = Number.parseFloat(r.purchasePrice);
        if (Number.isFinite(cost) && cost > 0) {
          const sale = money(cost * (1 + margin / 100));
          return { ...r, salePrice: String(sale) };
        }
        return r;
      })
    );
  }, []);

  const handleWholesaleProfitMarginChange = useCallback((marginVal) => {
    setWholesaleProfitMargin(marginVal);
    const margin = Number.parseFloat(marginVal);
    if (!Number.isFinite(margin) || margin < 0) return;

    setRows((prev) =>
      prev.map((r) => {
        if (r.status === 'saved') return r;
        const cost = Number.parseFloat(r.purchasePrice);
        if (Number.isFinite(cost) && cost > 0) {
          const wholesale = money(cost * (1 + margin / 100));
          return { ...r, wholesalePrice: String(wholesale) };
        }
        return r;
      })
    );
  }, []);

  const removeRow = useCallback((rowId) => {
    setRows((prev) => {
      const next = prev.filter((r) => r._id !== rowId);
      return next.length === 0 ? [makeEmptyRow()] : next;
    });
  }, []);

  const addRows = useCallback((count = 5) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, makeEmptyRow)]);
    setTimeout(() => {
      if (tableRef.current) {
         tableRef.current.scrollTop = tableRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  const generateAllBarcodes = useCallback(() => {
    const taken = new Set();
    setRows((prev) => prev.map((r) => {
      if (r.barcode && r.status !== 'saved') {
        taken.add(r.barcode.toLowerCase());
        return r;
      }
      if (r.status === 'saved') return r;
      let bc;
      for (let i = 0; i < 60; i++) {
        bc = makeEan13();
        if (!taken.has(bc.toLowerCase())) break;
      }
      taken.add(bc.toLowerCase());
      return { ...r, barcode: bc };
    }));
  }, []);

  // Derived stats
  const stats = useMemo(() => {
    const validRows = rows.filter((r) => nText(r.name));
    const savedRows = rows.filter((r) => r.status === 'saved');
    const errorRows = rows.filter((r) => r.status === 'error');
    return {
      total: rows.length,
      valid: validRows.length,
      saved: savedRows.length,
      errors: errorRows.length
    };
  }, [rows]);

  // Handle paste from Excel
  const handlePaste = useCallback((e) => {
    const clipText = e.clipboardData?.getData('text/plain');
    if (!clipText) return;

    const lines = clipText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length <= 1) return; // Single line — let default paste work

    e.preventDefault();

    const newRows = lines.map((line) => {
      const cells = line.split('\t');
      const row = makeEmptyRow();
      if (cells[0]) row.name = nText(cells[0]);
      if (cells[1]) row.purchasePrice = nText(cells[1]);
      if (cells[2]) row.salePrice = nText(cells[2]);
      if (cells[3]) row.wholesalePrice = nText(cells[3]);
      if (cells[4]) row.quantity = nText(cells[4]);
      if (cells[5]) row.barcode = nText(cells[5]);

      // Apply profit margins if purchasePrice is set and prices are not set
      const cost = Number.parseFloat(row.purchasePrice);
      if (Number.isFinite(cost) && cost > 0) {
        const margin = Number.parseFloat(profitMargin);
        if (Number.isFinite(margin) && margin >= 0 && !row.salePrice) {
          row.salePrice = String(money(cost * (1 + margin / 100)));
        }
        const whMargin = Number.parseFloat(wholesaleProfitMargin);
        if (Number.isFinite(whMargin) && whMargin >= 0 && !row.wholesalePrice) {
          row.wholesalePrice = String(money(cost * (1 + whMargin / 100)));
        }
      }

      return row;
    }).filter((r) => nText(r.name));

    if (newRows.length === 0) return;

    setRows((prev) => {
      // Replace empty rows with pasted data, append rest
      const nonEmpty = prev.filter((r) => nText(r.name) || r.status === 'saved');
      return [...nonEmpty, ...newRows];
    });
  }, [profitMargin, wholesaleProfitMargin]);

  // Save all valid rows
  const handleSaveAll = useCallback(async () => {
    setAlertMsg('');

    const validRows = rows.filter((r) => nText(r.name) && r.status !== 'saved');
    if (validRows.length === 0) {
      setAlertMsg('لا توجد صفوف جديدة صالحة للحفظ. أدخل اسم الصنف على الأقل.');
      return;
    }

    // Check duplicate barcodes within batch
    const barcodes = validRows.map((r) => nText(r.barcode).toLowerCase()).filter(Boolean);
    if (new Set(barcodes).size !== barcodes.length) {
      setAlertMsg('يوجد باركود مكرر بين الصفوف. تأكد من أن كل باركود فريد.');
      return;
    }

    setIsSaving(true);
    setProgress({ current: 0, total: validRows.length });

    let savedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];

      // Mark as saving
      setRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, status: 'saving', errorMsg: '' } : r)));

      try {
        const cost = money(row.purchasePrice);
        const basePrice = money(row.salePrice) || cost;
        const wholesalePrice = money(row.wholesalePrice) || basePrice;

        const payload = {
          name: nText(row.name),
          categoryId: row.categoryId ? Number(row.categoryId) : null,
          unitName: nText(row.unitName) || 'قطعة',
          sku: makeSku(row.name),
          barcode: nText(row.barcode) || null,
          basePrice,
          cost,
          wholesalePrice,
          minSalePrice: wholesalePrice,
          isActive: true,
          type: 'store',
          totalQuantity: Math.max(0, parseInt(row.quantity, 10) || 0),
          minStock: 5,
          maxStock: 100,
          hasVariants: false,
          variants: []
        };

        const res = await window.api.addProduct(payload);
        if (res?.error) throw new Error(res.error);

        // Update inventory
        if (res?.id) {
          const qty = Math.max(0, parseInt(row.quantity, 10) || 0);
          await window.api.updateInventory(res.id, {
            minStock: 5,
            maxStock: 100,
            warehouseQty: qty,
            displayQty: 0,
            totalQuantity: qty,
            notes: null,
            lastRestock: qty > 0 ? new Date().toISOString() : null
          });

          // Assign quantity to selected warehouse
          if (qty > 0 && selectedWarehouseId) {
            const whId = Number(selectedWarehouseId);
            if (whId > 0) {
              await window.api.updateMultipleWarehouseStocks(res.id, [
                { warehouseId: whId, quantity: qty }
              ]);
            }
          }
        }

        setRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, status: 'saved', errorMsg: '' } : r)));
        savedCount++;
      } catch (err) {
        setRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, status: 'error', errorMsg: err.message || 'فشل الحفظ' } : r)));
        errorCount++;
      }

      setProgress({ current: i + 1, total: validRows.length });
    }

    setIsSaving(false);

    if (savedCount > 0 && onComplete) {
      onComplete({ saved: savedCount, errors: errorCount });
    }

    if (errorCount === 0 && savedCount > 0) {
      setAlertMsg('');
    }
  }, [rows, onComplete, selectedWarehouseId]);

  if (!isOpen) return null;

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="bulk-modal-overlay">
      <div className="bulk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bulk-modal-header">
          <div>
            <h2><TableProperties size={20} style={{ marginLeft: '8px', verticalAlign: 'middle' }} /> إضافة عدة أصناف دفعة واحدة</h2>
            <p>أضف أصنافك بسرعة في جدول واحد — يمكنك لصق بيانات من Excel</p>
          </div>
          <button type="button" className="bulk-close-btn" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        <div className="bulk-toolbar">
          <div className="bulk-toolbar-left">
            <div className="bulk-action-group">
              <button type="button" className="bulk-toolbar-btn" onClick={() => addRows(1)} disabled={isSaving}>
                <Plus size={14} /> إضافة صف
              </button>
              <button type="button" className="bulk-toolbar-btn" onClick={() => addRows(5)} disabled={isSaving}>
                <Plus size={14} /> إضافة ٥ صفوف
              </button>
              <button type="button" className="bulk-toolbar-btn" onClick={generateAllBarcodes} disabled={isSaving}>
                <Barcode size={14} /> توليد باركود للكل
              </button>
            </div>

            <div className="bulk-smart-calc-box">
              <div className="calc-item">
                <span className="calc-label">% ربح التجزئة:</span>
                <input
                  type="number"
                  className="calc-input"
                  value={profitMargin}
                  onChange={(e) => handleProfitMarginChange(e.target.value)}
                  placeholder="0"
                  min="0"
                  disabled={isSaving}
                />
              </div>
              <div className="calc-divider" />
              <div className="calc-item">
                <span className="calc-label">% ربح الجملة:</span>
                <input
                  type="number"
                  className="calc-input"
                  value={wholesaleProfitMargin}
                  onChange={(e) => handleWholesaleProfitMarginChange(e.target.value)}
                  placeholder="0"
                  min="0"
                  disabled={isSaving}
                />
              </div>
            </div>

            {warehouses.length > 0 && (
              <div className="bulk-warehouse-picker-box">
                <Warehouse size={14} className="warehouse-icon" />
                <select
                  className="bulk-warehouse-select"
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  disabled={isSaving}
                >
                  <option value="">بدون تحديد مخزن</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="bulk-toolbar-right">
            <div className="bulk-toolbar-stats">
              {stats.saved > 0 && <span className="bulk-stat-chip success">محفوظ: <strong>{stats.saved}</strong></span>}
              {stats.errors > 0 && <span className="bulk-stat-chip error">أخطاء: <strong>{stats.errors}</strong></span>}
              <span className="bulk-stat-chip">الإجمالي: <strong>{stats.total}</strong></span>
            </div>
          </div>
        </div>

        <div className="bulk-modal-body">
          {alertMsg && (
            <div style={{ padding: '12px 20px 0', background: '#f8fbff' }}>
              <div className="bulk-alert">
                <AlertCircle size={14} />
                <span>{alertMsg}</span>
              </div>
            </div>
          )}

          <div className="bulk-grid-wrap" ref={tableRef} onPaste={handlePaste}>
            <table className="bulk-grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم الصنف *</th>
                  <th>الفئة</th>
                  <th>الوحدة</th>
                  <th>سعر الشراء</th>
                  <th>سعر البيع</th>
                  <th>سعر الجملة</th>
                  <th>الكمية</th>
                  <th>باركود</th>
                  <th style={{ textAlign: 'center' }}>حالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row._id}
                    className={row.status === 'saved' ? 'row-saved' : row.status === 'error' ? 'row-error' : ''}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <input
                        type="text"
                        className={`bulk-cell-input ${!nText(row.name) && row.status === 'error' ? 'has-error' : ''}`}
                        value={row.name}
                        onChange={(e) => updateRow(row._id, 'name', e.target.value)}
                        placeholder="اسم الصنف..."
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td style={{ minWidth: '140px' }}>
                      <select
                        className="bulk-cell-select"
                        value={row.categoryId}
                        onChange={(e) => updateRow(row._id, 'categoryId', e.target.value)}
                        disabled={isSaving || row.status === 'saved'}
                      >
                        <option value="">بدون فئة</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ minWidth: '100px' }}>
                      <select
                        className="bulk-cell-select"
                        value={row.unitName}
                        onChange={(e) => updateRow(row._id, 'unitName', e.target.value)}
                        disabled={isSaving || row.status === 'saved'}
                      >
                        {DEFAULT_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bulk-cell-input"
                        value={row.purchasePrice}
                        onChange={(e) => updateRow(row._id, 'purchasePrice', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bulk-cell-input"
                        value={row.salePrice}
                        onChange={(e) => updateRow(row._id, 'salePrice', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="bulk-cell-input"
                        value={row.wholesalePrice}
                        onChange={(e) => updateRow(row._id, 'wholesalePrice', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td style={{ maxWidth: '80px' }}>
                      <input
                        type="number"
                        className="bulk-cell-input"
                        value={row.quantity}
                        onChange={(e) => updateRow(row._id, 'quantity', e.target.value)}
                        placeholder="0"
                        min="0"
                        step="1"
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td style={{ minWidth: '150px' }}>
                      <input
                        type="text"
                        className="bulk-cell-input"
                        value={row.barcode}
                        onChange={(e) => updateRow(row._id, 'barcode', e.target.value)}
                        placeholder="باركود..."
                        disabled={isSaving || row.status === 'saved'}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`bulk-row-status ${row.status}`}>
                        {row.status === 'pending' && <Hourglass size={16} />}
                        {row.status === 'saving' && <Loader2 size={16} className="spin" />}
                        {row.status === 'saved' && <CheckCircle2 size={18} />}
                        {row.status === 'error' && (
                          <AlertCircle size={18} title={row.errorMsg || 'خطأ في الحفظ'} />
                        )}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="bulk-row-delete"
                        onClick={() => removeRow(row._id)}
                        disabled={isSaving || row.status === 'saved'}
                        title="حذف الصف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bulk-modal-footer">
          {isSaving && (
            <div className="bulk-progress-wrap">
              <div className="bulk-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          <div className="bulk-footer-actions">
            <div className="bulk-footer-info">
              {isSaving
                ? `جاري الحفظ: ${progress.current} / ${progress.total}`
                : <span><CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginLeft: '4px' }} /> {stats.valid} منتجات صالحة للحفظ</span>
              }
            </div>
            <div className="bulk-footer-buttons">
              <button type="button" className="bulk-btn-cancel" onClick={onClose} disabled={isSaving}>إلغاء</button>
              <button
                type="button"
                className="bulk-btn-save"
                onClick={handleSaveAll}
                disabled={isSaving || stats.valid === 0}
              >
                <Save size={16} />
                {isSaving ? 'جاري الحفظ...' : `حفظ الكل (${stats.valid})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, Warehouse, Layers, Hash, FileText, History, Info } from 'lucide-react';
import { safeAlert } from '../../utils/safeAlert';
import { nText, nInt } from '../../utils/productUtils';
import './ProductModal.css';

export default function WarehouseTransferModal({
  isOpen,
  onClose,
  product,
  warehouses = [],
  onTransferComplete
}) {
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [warehouseStockData, setWarehouseStockData] = useState({ totals: [], variants: [] });
  const [transfers, setTransfers] = useState([]);

  const variants = useMemo(
    () => (Array.isArray(warehouseStockData?.variants) ? warehouseStockData.variants : []),
    [warehouseStockData]
  );

  const selectedVariant = useMemo(() => {
    const selectedId = nInt(variantId, 0);
    if (selectedId > 0) {
      return variants.find((variant) => variant.id === selectedId) || null;
    }
    return variants.length === 1 ? variants[0] : null;
  }, [variantId, variants]);

  const sourceStocks = useMemo(() => {
    if (selectedVariant) {
      return Array.isArray(selectedVariant.warehouseStocks) ? selectedVariant.warehouseStocks : [];
    }
    return Array.isArray(warehouseStockData?.totals) ? warehouseStockData.totals : [];
  }, [selectedVariant, warehouseStockData]);

  useEffect(() => {
    if (!isOpen || !product?.id) return;

    (async () => {
      const res = await window.api.getWarehouseStocks(product.id);
      if (!res?.error) {
        const payload = (res && typeof res === 'object' && !Array.isArray(res))
          ? res
          : { totals: Array.isArray(res) ? res : [], variants: [] };

        setWarehouseStockData({
          totals: Array.isArray(payload.totals) ? payload.totals : [],
          variants: Array.isArray(payload.variants) ? payload.variants : []
        });

        if (Array.isArray(payload.variants) && payload.variants.length === 1) {
          setVariantId(String(payload.variants[0].id));
        } else {
          setVariantId('');
        }
      }
    })();

    (async () => {
      const res = await window.api.getWarehouseTransfers(product.id, 10);
      if (!res?.error) {
        setTransfers(Array.isArray(res) ? res : []);
      }
    })();

    setFromWarehouseId('');
    setToWarehouseId('');
    setQuantity('');
    setNotes('');
  }, [isOpen, product]);

  const handleTransfer = async () => {
    const fromId = nInt(fromWarehouseId);
    const toId = nInt(toWarehouseId);
    const selectedVariantId = nInt(variantId, 0);
    const qty = nInt(quantity);

    if (!fromId || !toId) {
      await safeAlert('اختر المخزن المصدر والمخزن الهدف', null, { type: 'warning', title: 'نقل المنتج' });
      return;
    }

    if (variants.length > 1 && selectedVariantId <= 0) {
      await safeAlert('اختَر المقاس/اللون المراد نقله أولًا', null, { type: 'warning', title: 'نقل المنتج' });
      return;
    }

    if (fromId === toId) {
      await safeAlert('لا يمكن النقل لنفس المخزن', null, { type: 'warning', title: 'نقل المنتج' });
      return;
    }

    if (qty <= 0) {
      await safeAlert('الكمية يجب أن تكون أكبر من صفر', null, { type: 'warning', title: 'نقل المنتج' });
      return;
    }

    const fromStock = sourceStocks.find((stock) => stock.warehouseId === fromId);
    const availableQty = fromStock ? nInt(fromStock.quantity, 0) : 0;
    if (qty > availableQty) {
      await safeAlert(`الكمية المتاحة في المخزن المصدر: ${availableQty}`, null, { type: 'error', title: 'نقل المنتج' });
      return;
    }

    setTransferring(true);
    try {
      const res = await window.api.transferProductBetweenWarehouses(
        product.id,
        fromId,
        toId,
        qty,
        nText(notes),
        selectedVariantId || null
      );
      if (res?.error) throw new Error(res.error);

      const stocksRes = await window.api.getWarehouseStocks(product.id);
      if (!stocksRes?.error) {
        const payload = (stocksRes && typeof stocksRes === 'object' && !Array.isArray(stocksRes))
          ? stocksRes
          : { totals: Array.isArray(stocksRes) ? stocksRes : [], variants: [] };
        setWarehouseStockData({
          totals: Array.isArray(payload.totals) ? payload.totals : [],
          variants: Array.isArray(payload.variants) ? payload.variants : []
        });
        if (Array.isArray(payload.variants) && payload.variants.length === 1) {
          setVariantId(String(payload.variants[0].id));
        }
      }

      const transfersRes = await window.api.getWarehouseTransfers(product.id, 10);
      if (!transfersRes?.error) {
        setTransfers(Array.isArray(transfersRes) ? transfersRes : []);
      }

      setFromWarehouseId('');
      setToWarehouseId('');
      if (variants.length !== 1) {
        setVariantId('');
      }
      setQuantity('');
      setNotes('');

      if (onTransferComplete) {
        await onTransferComplete();
      }

      await safeAlert('تم نقل المنتج بنجاح', null, { type: 'success', title: 'نقل المنتج' });
    } catch (err) {
      await safeAlert(err.message || 'فشل نقل المنتج', null, { type: 'error', title: 'نقل المنتج' });
    } finally {
      setTransferring(false);
    }
  };

  if (!isOpen) return null;

  const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
  const fromWarehouse = activeWarehouses.find((warehouse) => warehouse.id === nInt(fromWarehouseId));
  const fromStock = sourceStocks.find((stock) => stock.warehouseId === nInt(fromWarehouseId));
  const availableQty = fromStock ? nInt(fromStock.quantity, 0) : 0;

  return (
    <div className="product-modal-overlay" onClick={() => !transferring && onClose()} style={{ zIndex: 1100 }}>
      <div className="product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', height: 'auto', maxHeight: '92vh' }}>
        <div className="product-modal-header">
          <div>
            <h2><ArrowRightLeft size={20} style={{ marginLeft: '8px', verticalAlign: 'middle' }} /> نقل منتج بين المخازن</h2>
            <p>{product?.name || 'منتج'} | إدارة تتبع الحركات المخزنية</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} disabled={transferring}>
            <X size={20} />
          </button>
        </div>

        <div className="product-modal-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) 1fr', gap: '20px', padding: '20px' }}>
          {/* Transfer Form Section */}
          <div className="transfer-form-pane" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-section">
              {variants.length > 0 && (
                <label className="form-group">
                  <span><Layers size={14} style={{ marginLeft: '4px' }} /> المقاس / اللون</span>
                  <select
                    className="form-select"
                    value={variantId}
                    onChange={(e) => {
                      setVariantId(e.target.value);
                      setFromWarehouseId('');
                      setToWarehouseId('');
                      setQuantity('');
                    }}
                    disabled={transferring || variants.length === 1}
                  >
                    {variants.length > 1 ? <option value="">اختر المتغير</option> : null}
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {(variant.productSize || '-') + ' / ' + (variant.color || '-')} ({nInt(variant.quantity, 0)})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="form-group">
                <span><Warehouse size={14} style={{ marginLeft: '4px' }} /> من المخزن</span>
                <select
                  className="form-select"
                  value={fromWarehouseId}
                  onChange={(e) => {
                    setFromWarehouseId(e.target.value);
                    setQuantity('');
                  }}
                  disabled={transferring || (variants.length > 1 && !nInt(variantId))}
                >
                  <option value="">اختر المخزن المصدر</option>
                  {activeWarehouses.map((warehouse) => {
                    const stock = sourceStocks.find((entry) => entry.warehouseId === warehouse.id);
                    const qty = stock ? nInt(stock.quantity, 0) : 0;
                    return (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.icon || '🏭'} {warehouse.name} ({qty})
                      </option>
                    );
                  })}
                </select>
              </label>

              {fromWarehouse && (
                <div className="modal-inline-alert" style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd', padding: '8px 12px' }}>
                  <Info size={14} />
                  <span>الكمية المتاحة: <strong>{availableQty}</strong></span>
                </div>
              )}

              <label className="form-group">
                <span><ArrowRightLeft size={14} style={{ marginLeft: '4px' }} /> إلى المخزن</span>
                <select
                  className="form-select"
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  disabled={transferring || (variants.length > 1 && !nInt(variantId))}
                >
                  <option value="">اختر المخزن الهدف</option>
                  {activeWarehouses
                    .filter((warehouse) => warehouse.id !== nInt(fromWarehouseId))
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.icon || '🏭'} {warehouse.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="form-group">
                <span><Hash size={14} style={{ marginLeft: '4px' }} /> الكمية</span>
                <input
                  type="number"
                  min="1"
                  max={availableQty}
                  className="form-input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`أقصى كمية: ${availableQty}`}
                  disabled={transferring || !fromWarehouseId}
                />
              </label>

              <label className="form-group">
                <span><FileText size={14} style={{ marginLeft: '4px' }} /> ملاحظات</span>
                <textarea
                  className="form-input"
                  rows={2}
                  style={{ resize: 'none' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات حول النقل..."
                  disabled={transferring}
                />
              </label>
            </div>

            <button
              type="button"
              className="btn-save"
              onClick={handleTransfer}
              disabled={transferring || !fromWarehouseId || !toWarehouseId || nInt(quantity) <= 0 || (variants.length > 1 && !nInt(variantId))}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {transferring ? 'جاري النقل...' : 'إتمام عملية النقل'}
            </button>
          </div>

          {/* Transfer History Section */}
          <div className="transfer-history-pane" style={{ background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 700 }}>
              <History size={16} />
              <span>سجل الحركات الأخيرة</span>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {transfers.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  لا يوجد سجل حركات لهذا المنتج بعد
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {transfers.map((transfer) => {
                    const fromWarehouseInfo = warehouses.find((warehouse) => warehouse.id === transfer.fromWarehouseId);
                    const toWarehouseInfo = warehouses.find((warehouse) => warehouse.id === transfer.toWarehouseId);
                    const variantLabel = transfer?.variant
                      ? `${transfer.variant.productSize || '-'} / ${transfer.variant.color || '-'}`
                      : 'المنتج الأساسي';
                    return (
                      <div
                        key={transfer.id}
                        style={{
                          padding: '12px',
                          backgroundColor: '#fff',
                          border: '1px solid #edf2f7',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: '#475569' }}>
                            {fromWarehouseInfo?.name} ← {toWarehouseInfo?.name}
                          </span>
                          <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                            {transfer.quantity}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                          <Layers size={10} /> {variantLabel}
                        </div>
                        {transfer.notes && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', background: '#f8fafc', padding: '5px 8px', borderRadius: '4px' }}>
                            {transfer.notes}
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: '#cbd5e1', textAlign: 'left' }}>
                          {new Date(transfer.createdAt).toLocaleString('ar-EG')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="product-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={transferring}>إغلاق النافذة</button>
        </div>
      </div>
    </div>
  );
}


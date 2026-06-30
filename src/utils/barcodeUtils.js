/**
 * Barcode utility functions — all barcode generation, validation, and HTML rendering.
 * Extracted from Products.jsx for cleanliness.
 */
import JsBarcode from 'jsbarcode';
import { nText, nNum, inRange } from './productUtils';

// ─── Constants ────────────────────────────────────────────────
export const MM_TO_PX = 3.7795275591;

export const BARCODE_FORMAT_OPTIONS = [
    { value: 'CODE128', label: 'CODE128 (يدعم نص/أرقام)' },
    { value: 'CODE128A', label: 'CODE128A (رموز وتحكم)' },
    { value: 'CODE128B', label: 'CODE128B (نص/حروف كبيرة وصغيرة)' },
    { value: 'CODE128C', label: 'CODE128C (أرقام زوجية فقط)' },
    { value: 'QRCODE', label: 'QR Code (ثنائي الأبعاد)' },
    { value: 'DATAMATRIX', label: 'DataMatrix (ثنائي الأبعاد)' },
    { value: 'CODE39', label: 'CODE39 (حروف كبيرة وأرقام)' },
    { value: 'CODE93', label: 'CODE93 (قياسي)' },
    { value: 'CODE93FullASCII', label: 'CODE93 Full ASCII' },
    { value: 'EAN13', label: 'EAN-13 (12/13 رقم)' },
    { value: 'EAN8', label: 'EAN-8 (7/8 رقم)' },
    { value: 'EAN5', label: 'EAN-5 (5 أرقام)' },
    { value: 'EAN2', label: 'EAN-2 (رقمان)' },
    { value: 'UPC', label: 'UPC-A (11/12 رقم)' },
    { value: 'UPCE', label: 'UPC-E (6/7/8 أرقام)' },
    { value: 'ITF14', label: 'ITF-14 (14 رقم)' },
    { value: 'ITF', label: 'ITF (أرقام زوجية الطول)' },
    { value: 'MSI', label: 'MSI (أرقام)' },
    { value: 'MSI10', label: 'MSI10 (Checksum Mod10)' },
    { value: 'MSI11', label: 'MSI11 (Checksum Mod11)' },
    { value: 'MSI1010', label: 'MSI1010 (Double Mod10)' },
    { value: 'MSI1110', label: 'MSI1110 (Mod11 + Mod10)' },
    { value: 'pharmacode', label: 'Pharmacode' },
    { value: 'codabar', label: 'Codabar' }
];

export const MATRIX_BARCODE_FORMATS = new Set(['QRCODE', 'DATAMATRIX']);
export const isMatrixBarcodeFormat = (format) => MATRIX_BARCODE_FORMATS.has(format);

export const BARCODE_CODE_SOURCE_OPTIONS = [
    { value: 'auto', label: 'تلقائي (متغير ثم منتج ثم SKU)' },
    { value: 'variant', label: 'باركود المتغير فقط' },
    { value: 'product', label: 'باركود المنتج فقط' },
    { value: 'sku', label: 'SKU فقط' }
];

export const BARCODE_LABEL_PRESETS = [
    { id: 'small', label: 'صغير 38×25 مم', widthMm: 38, heightMm: 25 },
    { id: 'medium', label: 'متوسط 50×30 مم', widthMm: 50, heightMm: 30 },
    { id: 'large', label: 'كبير 58×40 مم', widthMm: 58, heightMm: 40 },
    { id: 'custom', label: 'مخصص', widthMm: null, heightMm: null }
];

export const BARCODE_STUDIO_TABS = [
    { id: 'templates', label: 'القوالب', hint: 'حفظ واسترجاع إعدادات الطباعة حسب الطابعة والمقاس.' },
    { id: 'output', label: 'الطباعة', hint: 'مراجعة وضع التنفيذ والطابعة الفعلية والإعدادات الافتراضية.' },
    { id: 'source', label: 'النوع والمصدر', hint: 'اختيار نوع الباركود ومن أين يُقرأ الكود.' },
    { id: 'layout', label: 'المقاس والتخطيط', hint: 'التحكم في أبعاد الملصق، الأعمدة، والهوامش.' },
    { id: 'design', label: 'التصميم', hint: 'ألوان الملصق، أحجام الخطوط، وعناصر العرض.' }
];

export const BARCODE_FONT_OPTIONS = [
    { value: "'Tajawal', sans-serif", label: 'Tajawal (افتراضي)', url: 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap' },
    { value: "'Cairo', sans-serif", label: 'Cairo', url: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap' },
    { value: "'Almarai', sans-serif", label: 'Almarai', url: 'https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap' },
    { value: "'IBM Plex Sans Arabic', sans-serif", label: 'IBM Plex Sans', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap' },
    { value: "'Amiri', serif", label: 'Amiri (خط كلاسيكي)', url: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' }
];

export const DEFAULT_BARCODE_STUDIO = {
    format: 'CODE128',
    codeSource: 'auto',
    presetId: 'medium',
    labelWidthMm: 50,
    labelHeightMm: 30,
    columns: 4,
    copiesPerItem: 1,
    pageMarginMm: 6,
    gapXMm: 4,
    gapYMm: 4,
    paddingMm: 2,
    barcodeHeightMm: 12,
    barcodeWidthPx: 1.8,
    barcodeOffsetXMm: 0,
    barcodeOffsetYMm: 0,
    barcodeMarginTopMm: 0.5,
    barcodeMarginBottomMm: 0.5,
    nameFontPx: 12,
    metaFontPx: 10,
    priceFontPx: 12,
    nameLineHeight: 1.15,
    metaLineHeight: 1.15,
    priceLineHeight: 1.15,
    elementGapMm: 0.8,
    textOffsetXMm: 0,
    textOffsetYMm: 0,
    fontFamily: "'Tajawal', sans-serif",
    textAlign: 'center',
    contentVerticalAlign: 'center',
    lineColor: '#0f172a',
    cardBackground: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidthPx: 1,
    borderRadiusMm: 3,
    showBorder: true,
    showName: true,
    showSku: true,
    showVariant: true,
    showPrice: true,
    showCode: true
};

export const BARCODE_STUDIO_STORAGE_KEY = 'products.barcodeStudio.v1';
export const BARCODE_TEMPLATE_STORAGE_KEY = 'products.barcodeTemplates.v1';

// ─── Sanitize / validate ──────────────────────────────────────

export const sanitizeBarcodeStudioSettings = (raw = {}) => {
    const presetIds = new Set(BARCODE_LABEL_PRESETS.map((preset) => preset.id));
    const allowedFormats = new Set(BARCODE_FORMAT_OPTIONS.map((option) => option.value));
    const allowedSources = new Set(BARCODE_CODE_SOURCE_OPTIONS.map((option) => option.value));
    const allowedAlign = new Set(['center', 'right', 'left']);
    const allowedVerticalAlign = new Set(['top', 'center', 'bottom', 'space-between']);

    return {
        format: allowedFormats.has(raw.format) ? raw.format : DEFAULT_BARCODE_STUDIO.format,
        codeSource: allowedSources.has(raw.codeSource) ? raw.codeSource : DEFAULT_BARCODE_STUDIO.codeSource,
        presetId: presetIds.has(raw.presetId) ? raw.presetId : DEFAULT_BARCODE_STUDIO.presetId,
        labelWidthMm: inRange(raw.labelWidthMm, DEFAULT_BARCODE_STUDIO.labelWidthMm, 20, 120),
        labelHeightMm: inRange(raw.labelHeightMm, DEFAULT_BARCODE_STUDIO.labelHeightMm, 15, 90),
        columns: Math.round(inRange(raw.columns, DEFAULT_BARCODE_STUDIO.columns, 1, 8)),
        copiesPerItem: Math.round(inRange(raw.copiesPerItem, DEFAULT_BARCODE_STUDIO.copiesPerItem, 1, 50)),
        pageMarginMm: inRange(raw.pageMarginMm, DEFAULT_BARCODE_STUDIO.pageMarginMm, 0, 20),
        gapXMm: inRange(raw.gapXMm, DEFAULT_BARCODE_STUDIO.gapXMm, 0, 20),
        gapYMm: inRange(raw.gapYMm, DEFAULT_BARCODE_STUDIO.gapYMm, 0, 20),
        paddingMm: inRange(raw.paddingMm, DEFAULT_BARCODE_STUDIO.paddingMm, 0, 10),
        barcodeHeightMm: inRange(raw.barcodeHeightMm, DEFAULT_BARCODE_STUDIO.barcodeHeightMm, 6, 40),
        barcodeWidthPx: inRange(raw.barcodeWidthPx, DEFAULT_BARCODE_STUDIO.barcodeWidthPx, 1, 6),
        barcodeOffsetXMm: inRange(raw.barcodeOffsetXMm, DEFAULT_BARCODE_STUDIO.barcodeOffsetXMm, -20, 20),
        barcodeOffsetYMm: inRange(raw.barcodeOffsetYMm, DEFAULT_BARCODE_STUDIO.barcodeOffsetYMm, -20, 20),
        barcodeMarginTopMm: inRange(raw.barcodeMarginTopMm, DEFAULT_BARCODE_STUDIO.barcodeMarginTopMm, 0, 20),
        barcodeMarginBottomMm: inRange(raw.barcodeMarginBottomMm, DEFAULT_BARCODE_STUDIO.barcodeMarginBottomMm, 0, 20),
        nameFontPx: Math.round(inRange(raw.nameFontPx, DEFAULT_BARCODE_STUDIO.nameFontPx, 8, 22)),
        metaFontPx: Math.round(inRange(raw.metaFontPx, DEFAULT_BARCODE_STUDIO.metaFontPx, 7, 18)),
        priceFontPx: Math.round(inRange(raw.priceFontPx, DEFAULT_BARCODE_STUDIO.priceFontPx, 8, 22)),
        nameLineHeight: inRange(raw.nameLineHeight, DEFAULT_BARCODE_STUDIO.nameLineHeight, 0.8, 2),
        metaLineHeight: inRange(raw.metaLineHeight, DEFAULT_BARCODE_STUDIO.metaLineHeight, 0.8, 2),
        priceLineHeight: inRange(raw.priceLineHeight, DEFAULT_BARCODE_STUDIO.priceLineHeight, 0.8, 2),
        elementGapMm: inRange(raw.elementGapMm, DEFAULT_BARCODE_STUDIO.elementGapMm, 0, 12),
        textOffsetXMm: inRange(raw.textOffsetXMm, DEFAULT_BARCODE_STUDIO.textOffsetXMm, -20, 20),
        textOffsetYMm: inRange(raw.textOffsetYMm, DEFAULT_BARCODE_STUDIO.textOffsetYMm, -20, 20),
        fontFamily: nText(raw.fontFamily) || DEFAULT_BARCODE_STUDIO.fontFamily,
        textAlign: allowedAlign.has(raw.textAlign) ? raw.textAlign : DEFAULT_BARCODE_STUDIO.textAlign,
        contentVerticalAlign: allowedVerticalAlign.has(raw.contentVerticalAlign) ? raw.contentVerticalAlign : DEFAULT_BARCODE_STUDIO.contentVerticalAlign,
        lineColor: nText(raw.lineColor) || DEFAULT_BARCODE_STUDIO.lineColor,
        cardBackground: nText(raw.cardBackground) || DEFAULT_BARCODE_STUDIO.cardBackground,
        borderColor: nText(raw.borderColor) || DEFAULT_BARCODE_STUDIO.borderColor,
        borderWidthPx: inRange(raw.borderWidthPx, DEFAULT_BARCODE_STUDIO.borderWidthPx, 0, 8),
        borderRadiusMm: inRange(raw.borderRadiusMm, DEFAULT_BARCODE_STUDIO.borderRadiusMm, 0, 12),
        showBorder: raw.showBorder !== false,
        showName: raw.showName !== false,
        showSku: raw.showSku !== false,
        showVariant: raw.showVariant !== false,
        showPrice: raw.showPrice !== false,
        showCode: raw.showCode !== false
    };
};

export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const mmToPx = (value, fallback = 10) =>
    Math.max(1, Math.round(inRange(value, fallback, 0.1, 200) * MM_TO_PX));

// ─── Templates ────────────────────────────────────────────────

export const normalizeTemplateValue = (value, maxLength = 64) =>
    nText(value).slice(0, maxLength);

export const sanitizeBarcodeTemplate = (template, fallbackIndex = 1) => {
    const now = Date.now();
    const createdAt = Number.isFinite(Number(template?.createdAt)) ? Number(template.createdAt) : now;
    const updatedAt = Number.isFinite(Number(template?.updatedAt)) ? Number(template.updatedAt) : createdAt;

    return {
        id: nText(template?.id) || `barcode-template-${createdAt}-${fallbackIndex}`,
        name: normalizeTemplateValue(template?.name, 80) || `قالب ${fallbackIndex}`,
        printer: normalizeTemplateValue(template?.printer, 80),
        settings: sanitizeBarcodeStudioSettings(template?.settings),
        createdAt,
        updatedAt
    };
};

export const parseBarcodeTemplates = (rawValue) => {
    if (!rawValue) return [];

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) return [];

        const uniqueIds = new Set();
        const sanitized = [];

        parsed.forEach((item, index) => {
            const template = sanitizeBarcodeTemplate(item, index + 1);
            if (uniqueIds.has(template.id)) return;
            uniqueIds.add(template.id);
            sanitized.push(template);
        });

        return sanitized.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
        return [];
    }
};

// ─── Barcode value / normalization ────────────────────────────

export const barcodeValueFromSource = (row, source) => {
    const variantBarcode = nText(row.variantBarcode);
    const productBarcode = nText(row.productBarcode);
    const skuValue = nText(row.sku);

    switch (source) {
        case 'variant':
            return variantBarcode;
        case 'product':
            return productBarcode;
        case 'sku':
            return skuValue;
        case 'auto':
        default:
            return variantBarcode || productBarcode || skuValue || nText(row.code);
    }
};

export const normalizeBarcodeByFormat = (value, format) => {
    const text = nText(value);
    if (!text) return null;
    if (
        format === 'CODE128'
        || format === 'CODE128A'
        || format === 'CODE128B'
        || format === 'CODE93FullASCII'
        || format === 'QRCODE'
        || format === 'DATAMATRIX'
    ) return text;

    const digits = text.replace(/\D/g, '');
    const upperText = text.toUpperCase();

    switch (format) {
        case 'CODE128C':
            if (!digits || digits.length % 2 !== 0) return null;
            return digits;
        case 'CODE39': {
            const cleaned = upperText.replace(/\s+/g, ' ');
            return /^[0-9A-Z\-\. $\/\+%]+$/.test(cleaned) ? cleaned : null;
        }
        case 'CODE93': {
            const cleaned = upperText.replace(/\s+/g, ' ');
            return /^[0-9A-Z\-\. $\/\+%]+$/.test(cleaned) ? cleaned : null;
        }
        case 'EAN13':
            if (!digits) return null;
            if (digits.length >= 13) return digits.slice(0, 13);
            if (digits.length === 12) return digits;
            return null;
        case 'EAN8':
            if (!digits) return null;
            if (digits.length >= 8) return digits.slice(0, 8);
            if (digits.length === 7) return digits;
            return null;
        case 'EAN5':
            if (!digits) return null;
            if (digits.length >= 5) return digits.slice(0, 5);
            return null;
        case 'EAN2':
            if (!digits) return null;
            if (digits.length >= 2) return digits.slice(0, 2);
            return null;
        case 'UPC':
            if (!digits) return null;
            if (digits.length >= 12) return digits.slice(0, 12);
            if (digits.length === 11) return digits;
            return null;
        case 'UPCE':
            if (!digits) return null;
            if (digits.length >= 8) return digits.slice(0, 8);
            if (digits.length === 6 || digits.length === 7) return digits;
            return null;
        case 'ITF14':
            if (!digits) return null;
            if (digits.length >= 14) return digits.slice(0, 14);
            return null;
        case 'ITF':
            if (!digits || digits.length % 2 !== 0) return null;
            return digits;
        case 'MSI':
        case 'MSI10':
        case 'MSI11':
        case 'MSI1010':
        case 'MSI1110':
        case 'pharmacode':
            return digits || null;
        case 'codabar': {
            const cleaned = upperText.replace(/\s+/g, '');
            if (!/^[0-9A-D\-\$:\/\.\+]+$/.test(cleaned)) return null;
            const startsWithGuard = /^[A-D]/.test(cleaned);
            const endsWithGuard = /[A-D]$/.test(cleaned);
            if (startsWithGuard && endsWithGuard) return cleaned;
            return `A${cleaned}A`;
        }
        default:
            return text;
    }
};

// ─── SVG generation ───────────────────────────────────────────

export const buildBarcodeSvg = (value, settings, bwipLibrary = null) => {
    if (typeof document === 'undefined') return '';

    if (isMatrixBarcodeFormat(settings.format)) {
        if (!bwipLibrary || typeof bwipLibrary.toSVG !== 'function') {
            return '';
        }

        const bcid = settings.format === 'QRCODE' ? 'qrcode' : 'datamatrix';

        try {
            const svg = bwipLibrary.toSVG({
                bcid,
                text: value,
                scale: Math.max(1, Math.round(inRange(settings.barcodeWidthPx, 2, 1, 6))),
                width: inRange(settings.barcodeHeightMm, DEFAULT_BARCODE_STUDIO.barcodeHeightMm, 6, 80),
                height: inRange(settings.barcodeHeightMm, DEFAULT_BARCODE_STUDIO.barcodeHeightMm, 6, 80),
                padding: 0,
                includetext: false,
                barcolor: settings.lineColor
            });
            return typeof svg === 'string' ? svg : '';
        } catch (err) {
            return '';
        }
    }

    try {
        const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        let isValid = true;

        JsBarcode(svgNode, value, {
            format: settings.format,
            width: settings.barcodeWidthPx,
            height: mmToPx(settings.barcodeHeightMm, DEFAULT_BARCODE_STUDIO.barcodeHeightMm),
            margin: 0,
            lineColor: settings.lineColor,
            displayValue: false,
            background: 'transparent',
            valid: (valid) => { isValid = valid; }
        });

        return isValid ? svgNode.outerHTML : '';
    } catch (err) {
        return '';
    }
};

export const buildBarcodeLabels = (rows, settings, limit = Number.POSITIVE_INFINITY, bwipLibrary = null) => {
    const labels = [];
    const invalidRows = [];
    const globalCopies = Math.max(1, Math.round(inRange(settings.copiesPerItem, 1, 1, 50)));

    for (const row of rows) {
        const rawCode = barcodeValueFromSource(row, settings.codeSource);
        const normalizedCode = normalizeBarcodeByFormat(rawCode, settings.format);
        if (!normalizedCode) {
            invalidRows.push({ row, reason: 'invalid-format' });
            continue;
        }

        const svg = buildBarcodeSvg(normalizedCode, settings, bwipLibrary);
        if (!svg) {
            invalidRows.push({ row, reason: 'render-failed' });
            continue;
        }

        const base = {
            ...row,
            code: normalizedCode,
            barcodeSvg: svg
        };

        // Use row.quantity if provided (for invoice bulk printing), otherwise use global setting
        const rowCopies = Number.isFinite(row.quantity) && row.quantity > 0 
            ? Math.round(row.quantity) 
            : globalCopies;

        for (let idx = 0; idx < rowCopies; idx += 1) {
            labels.push(base);
            if (labels.length >= limit) {
                return { labels, invalidRows };
            }
        }
    }

    return { labels, invalidRows };
};

// ─── Full-page HTML for print ─────────────────────────────────

export const barcodeStudioHtml = (labels, settings) => {
    const safe = sanitizeBarcodeStudioSettings(settings);
    const textAlign = safe.textAlign === 'left' ? 'left' : safe.textAlign === 'right' ? 'right' : 'center';
    const justifyContent = {
        top: 'flex-start',
        center: 'center',
        bottom: 'flex-end',
        'space-between': 'space-between'
    }[safe.contentVerticalAlign] || 'center';
    const isMatrixFormat = isMatrixBarcodeFormat(safe.format);
    const cards = labels.map((label) => {
        const size = nText(label.size);
        const color = nText(label.color);
        const hasVariant = (size && size !== 'موحد') || (color && color !== '-');
        const variantText = [size && size !== 'موحد' ? size : '', color && color !== '-' ? color : ''].filter(Boolean).join(' / ');

        return `
      <article class="label">
        ${safe.showName ? `<div class="name">${escapeHtml(label.name || 'منتج')}</div>` : ''}
        ${safe.showSku ? `<div class="meta">SKU: ${escapeHtml(label.sku || '-')}</div>` : ''}
        ${safe.showVariant && hasVariant ? `<div class="meta">${escapeHtml(variantText)}</div>` : ''}
        <div class="barcode ${isMatrixFormat ? 'matrix' : 'linear'}">${label.barcodeSvg}</div>
        ${safe.showCode ? `<div class="code">${escapeHtml(label.code || '')}</div>` : ''}
        ${safe.showPrice ? `<div class="price">${Number(label.price || 0).toFixed(2)} ج.م</div>` : ''}
      </article>
    `;
    }).join('');

    return `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>ملصقات باركود المنتجات</title>
      <style>
        ${BARCODE_FONT_OPTIONS.map(f => `@import url('${f.url}');`).join('\n')}
        @page { margin: ${safe.pageMarginMm}mm; }
        * { box-sizing: border-box; }
        html, body {
          width: auto;
          min-height: 100%;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: ${safe.fontFamily}, Tahoma, "Segoe UI", sans-serif;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          display: grid;
          grid-template-columns: repeat(${safe.columns}, ${safe.labelWidthMm}mm);
          justify-content: center;
          column-gap: ${safe.gapXMm}mm;
          row-gap: ${safe.gapYMm}mm;
        }
        .label {
          width: ${safe.labelWidthMm}mm;
          height: ${safe.labelHeightMm}mm;
          background: ${safe.cardBackground};
          border: ${safe.showBorder && safe.borderWidthPx > 0 ? `${safe.borderWidthPx}px solid ${safe.borderColor}` : 'none'};
          border-radius: ${safe.borderRadiusMm}mm;
          padding: ${safe.paddingMm}mm;
          display: flex;
          flex-direction: column;
          justify-content: ${justifyContent};
          text-align: ${textAlign};
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
          gap: ${safe.elementGapMm}mm;
        }
        .name {
          font-size: ${safe.nameFontPx}px;
          font-weight: 700;
          line-height: ${safe.nameLineHeight};
          color: #0f172a;
          transform: translate(${safe.textOffsetXMm}mm, ${safe.textOffsetYMm}mm);
        }
        .meta {
          font-size: ${safe.metaFontPx}px;
          color: #334155;
          line-height: ${safe.metaLineHeight};
          transform: translate(${safe.textOffsetXMm}mm, ${safe.textOffsetYMm}mm);
        }
        .barcode {
          width: 100%;
          min-height: ${safe.barcodeHeightMm}mm;
          display: grid;
          place-items: center;
          margin-top: ${safe.barcodeMarginTopMm}mm;
          margin-bottom: ${safe.barcodeMarginBottomMm}mm;
          transform: translate(${safe.barcodeOffsetXMm}mm, ${safe.barcodeOffsetYMm}mm);
        }
        .barcode.linear svg {
          width: 100%;
          height: ${safe.barcodeHeightMm}mm;
          display: block;
          flex-shrink: 0;
        }
        .barcode.matrix svg {
          width: auto;
          max-width: 100%;
          height: ${safe.barcodeHeightMm}mm;
          display: block;
          flex-shrink: 0;
        }
        .code {
          font-size: ${safe.metaFontPx}px;
          font-weight: 700;
          letter-spacing: 0.3px;
          color: #111827;
          line-height: ${safe.metaLineHeight};
          transform: translate(${safe.textOffsetXMm}mm, ${safe.textOffsetYMm}mm);
        }
        .price {
          font-size: ${safe.priceFontPx}px;
          font-weight: 700;
          color: #065f46;
          line-height: ${safe.priceLineHeight};
          transform: translate(${safe.textOffsetXMm}mm, ${safe.textOffsetYMm}mm);
        }
      </style>
    </head>
    <body>
      <section class="sheet">${cards}</section>
    </body>
  </html>`;
};

// ─── Barcode row preparation ──────────────────────────────────

export const barcodeRows = (products, salePriceOfFn) => {
    const rows = [];
    products.forEach((p) => {
        const sku = nText(p.sku) || `P${p.id}`;
        const vars = p.variants || [];
        const productBarcode = nText(p.barcode);

        if (!vars.length) {
            rows.push({
                productId: p.id,
                name: p.name || 'منتج',
                sku,
                size: 'موحد',
                color: '-',
                price: salePriceOfFn(p),
                productBarcode,
                variantBarcode: '',
                code: productBarcode || `${sku}-STD`
            });
            return;
        }

        vars.forEach((v, idx) => rows.push({
            productId: p.id,
            name: p.name || 'منتج',
            sku,
            size: v.productSize || 'موحد',
            color: v.color || '-',
            price: Number(v.price || p.basePrice || 0),
            productBarcode,
            variantBarcode: nText(v.barcode),
            code: nText(v.barcode) || productBarcode || `${sku}-${v.productSize || 'S'}-${v.color || idx + 1}`
        }));
    });
    return rows;
};

export const barcodeRowsFromPurchaseItems = (items) => {
    return items.map((item) => {
        const variant = item.variant || {};
        const product = variant.product || {};
        const sku = nText(product.sku) || nText(variant.sku) || `P${product.id || '-'}`;
        
        return {
            productId: product.id,
            variantId: variant.id,
            name: product.name || item.productName || 'منتج',
            sku,
            size: variant.productSize || item.size || 'موحد',
            color: variant.color || item.color || '-',
            // User requested Selling Price
            price: Number(variant.price || product.basePrice || 0),
            productBarcode: nText(product.barcode),
            variantBarcode: nText(variant.barcode),
            quantity: Number(item.quantity || 0),
            code: nText(variant.barcode) || nText(product.barcode) || sku
        };
    });
};

/**
 * Calculates the total page size in microns for a set of barcode labels.
 * Useful for telling the printer the exact dimensions to prevent skipping labels.
 */
export const calculateBarcodePageSize = (labelsCount, settings) => {
    const safe = sanitizeBarcodeStudioSettings(settings);
    const columns = Math.max(1, safe.columns);
    const rows = Math.ceil(labelsCount / columns);

    // Width calculation: (cols * labelWidth) + ((cols-1) * gapX) + (2 * margin)
    const totalWidthMm = (columns * safe.labelWidthMm) + ((columns - 1) * safe.gapXMm) + (2 * safe.pageMarginMm);
    
    // Height calculation: (rows * labelHeight) + (Math.max(0, rows - 1) * safe.gapYMm) + (2 * safe.pageMarginMm);
    const totalHeightMm = (rows * safe.labelHeightMm) + (Math.max(0, rows - 1) * safe.gapYMm) + (2 * safe.pageMarginMm);

    return {
        width: Math.round(totalWidthMm * 1000),
        height: Math.round(totalHeightMm * 1000)
    };
};

import { nText, inRange } from './productUtils';

const BARCODE_FORMAT_VALUES = [
  'CODE128',
  'CODE128A',
  'CODE128B',
  'CODE128C',
  'QRCODE',
  'DATAMATRIX',
  'CODE39',
  'CODE93',
  'CODE93FullASCII',
  'EAN13',
  'EAN8',
  'EAN5',
  'EAN2',
  'UPC',
  'UPCE',
  'ITF14',
  'ITF',
  'MSI',
  'MSI10',
  'MSI11',
  'MSI1010',
  'MSI1110',
  'pharmacode',
  'codabar'
];

const BARCODE_SOURCE_VALUES = ['auto', 'variant', 'product', 'sku'];
const BARCODE_PRESET_IDS = ['small', 'medium', 'large', 'custom'];
export const BARCODE_STUDIO_TAB_IDS = ['templates', 'output', 'source', 'layout', 'design'];

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

export const sanitizeBarcodeStudioSettings = (raw = {}) => {
  const allowedFormats = new Set(BARCODE_FORMAT_VALUES);
  const allowedSources = new Set(BARCODE_SOURCE_VALUES);
  const presetIds = new Set(BARCODE_PRESET_IDS);
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

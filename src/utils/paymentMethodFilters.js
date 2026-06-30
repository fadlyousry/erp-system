const POS_ALLOWED_PAYMENT_CODES = new Set([
  'CASH',
  'VODAFONE_CASH',
  'INSTAPAY'
]);

export const POS_PAYMENT_METHOD_ORDER = [
  'CASH',
  'VODAFONE_CASH',
  'INSTAPAY'
];

export const DEFAULT_POS_PAYMENT_METHODS = [
  { id: 'CASH', code: 'CASH', name: '\u0646\u0642\u062f\u064a' },
  { id: 'VODAFONE_CASH', code: 'VODAFONE_CASH', name: '\u0641\u0648\u062f\u0627\u0641\u0648\u0646 \u0643\u0627\u0634' },
  { id: 'INSTAPAY', code: 'INSTAPAY', name: '\u0627\u0646\u0633\u062a\u0627\u0628\u0627\u064a' }
];

const PAYMENT_CODE_ALIASES = {
  cash: 'CASH',
  نقدي: 'CASH',
  كاش: 'CASH',
  vodafonecash: 'VODAFONE_CASH',
  فودافونكاش: 'VODAFONE_CASH',
  instapay: 'INSTAPAY',
  انستاباي: 'INSTAPAY'
};

const normalizeAliasKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

export const normalizePaymentMethodCode = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const byAlias = PAYMENT_CODE_ALIASES[normalizeAliasKey(trimmed)];
  if (byAlias) return byAlias;

  return trimmed
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
};

export const filterPosPaymentMethods = (methods) => {
  if (!Array.isArray(methods)) return [];

  const methodByCode = new Map();
  methods.forEach((method) => {
    const code = normalizePaymentMethodCode(method?.code || method?.name);
    if (!POS_ALLOWED_PAYMENT_CODES.has(code) || methodByCode.has(code)) return;
    methodByCode.set(code, {
      ...method,
      code
    });
  });

  return POS_PAYMENT_METHOD_ORDER
    .map((code) => methodByCode.get(code))
    .filter(Boolean);
};

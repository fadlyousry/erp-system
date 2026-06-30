import { nKey, nNum, nText } from './productUtils';

export const CUSTOMER_IMPORT_FIELD_OPTIONS = [
  {
    key: 'name',
    label: 'اسم العميل',
    required: true,
    aliases: ['name', 'customername', 'customer', 'اسم', 'اسم العميل', 'العميل']
  },
  {
    key: 'phone',
    label: 'الموبايل',
    aliases: ['phone', 'mobile', 'tel', 'phone1', 'رقم', 'رقم الهاتف', 'الهاتف', 'الموبايل', 'جوال']
  },
  {
    key: 'phone2',
    label: 'رقم إضافي',
    aliases: ['phone2', 'mobile2', 'secondaryphone', 'altphone', 'رقم2', 'هاتف2', 'رقم اضافي']
  },
  {
    key: 'address',
    label: 'العنوان',
    aliases: ['address', 'street', 'عنوان', 'العنوان']
  },
  {
    key: 'city',
    label: 'المدينة',
    aliases: ['city', 'town', 'مدينة', 'المدينة']
  },
  {
    key: 'district',
    label: 'المنطقة',
    aliases: ['district', 'area', 'region', 'حي', 'منطقة', 'المنطقة']
  },
  {
    key: 'notes',
    label: 'ملاحظات',
    aliases: ['notes', 'note', 'comments', 'remark', 'ملاحظات', 'ملاحظة']
  },
  {
    key: 'creditLimit',
    label: 'حد الائتمان',
    aliases: ['creditlimit', 'limit', 'credit', 'debtlimit', 'حد', 'حد الائتمان', 'الحد']
  },
  {
    key: 'balance',
    label: 'الرصيد',
    aliases: [
      'balance',
      'currentbalance',
      'openingbalance',
      'debt',
      'dues',
      'amountdue',
      'الرصيد',
      'رصيد',
      'الرصيد الحالي',
      'رصيد افتتاحي',
      'مديونية',
      'المتبقي'
    ]
  },
  {
    key: 'customerType',
    label: 'نوع العميل',
    aliases: ['customertype', 'type', 'segment', 'نوع', 'نوع العميل', 'التصنيف']
  }
];

const normalizeCustomerType = (value) => {
  const text = nText(value);
  if (!text) return 'عادي';

  const key = nKey(text);
  if (!key) return 'عادي';

  if (key === 'vip' || key.includes('vip') || key.includes('مميز')) return 'VIP';

  if (
    key.includes('wholesale')
    || key.includes('جملة')
    || key.includes('جمله')
    || key.includes('تاجرجملة')
    || key.includes('تاجرجمله')
  ) {
    return 'تاجر جملة';
  }

  if (key.includes('regular') || key.includes('normal') || key.includes('عادي')) return 'عادي';

  return text;
};

export const parseLine = (line, delim) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const n = line[i + 1];
    if (c === '"') {
      if (q && n === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
      continue;
    }
    if (c === delim && !q) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

export const delimiter = (header) => {
  const c = header.split(',').length;
  const s = header.split(';').length;
  const t = header.split('\t').length;
  if (t >= c && t >= s) return '\t';
  if (s > c) return ';';
  return ',';
};

export const toImportHeaders = (headers) => (
  headers.map((label, index) => {
    const cleanLabel = nText(label) || `عمود ${index + 1}`;
    return {
      id: String(index),
      index,
      label: cleanLabel,
      key: nKey(cleanLabel) || `column${index + 1}`
    };
  })
);

export const buildCustomerImportAutoMapping = (headers = []) => {
  const mapping = Object.fromEntries(CUSTOMER_IMPORT_FIELD_OPTIONS.map((field) => [field.key, '']));
  const usedHeaders = new Set();

  CUSTOMER_IMPORT_FIELD_OPTIONS.forEach((field) => {
    const aliasKeys = (field.aliases || []).map((alias) => nKey(alias)).filter(Boolean);
    if (!aliasKeys.length) return;

    let match = headers.find((header) => (
      !usedHeaders.has(header.id)
      && aliasKeys.some((alias) => header.key === alias)
    ));

    if (!match) {
      match = headers.find((header) => (
        !usedHeaders.has(header.id)
        && aliasKeys.some((alias) => header.key.includes(alias) || alias.includes(header.key))
      ));
    }

    if (match) {
      mapping[field.key] = match.id;
      usedHeaders.add(match.id);
    }
  });

  return mapping;
};

export const mapRowsWithCustomerImportMapping = (rows, mapping) => (
  rows.map((values) => {
    const mappedRow = {};

    CUSTOMER_IMPORT_FIELD_OPTIONS.forEach((field) => {
      const columnId = mapping?.[field.key];
      if (columnId === undefined || columnId === null || columnId === '') {
        mappedRow[field.key] = '';
        return;
      }
      const columnIndex = Number(columnId);
      mappedRow[field.key] = nText(values[columnIndex] ?? '');
    });

    return mappedRow;
  })
);

export const sanitizeImportedCustomer = (row = {}) => ({
  // keep numeric fields optional when the source cell is blank
  // so existing values are not overwritten during update-import.
  ...(() => {
    const creditLimitText = nText(row.creditLimit);
    const parsedCreditLimit = creditLimitText ? nNum(creditLimitText, Number.NaN) : Number.NaN;
    const balanceText = nText(row.balance);
    const parsedBalance = balanceText ? nNum(balanceText, Number.NaN) : Number.NaN;

    return {
      creditLimit: Number.isFinite(parsedCreditLimit) ? Math.max(0, parsedCreditLimit) : undefined,
      balance: Number.isFinite(parsedBalance) ? parsedBalance : undefined
    };
  })(),
  name: nText(row.name),
  phone: nText(row.phone),
  phone2: nText(row.phone2),
  address: nText(row.address),
  city: nText(row.city),
  district: nText(row.district),
  notes: nText(row.notes),
  customerType: normalizeCustomerType(row.customerType)
});

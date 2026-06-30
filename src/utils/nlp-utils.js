/**
 * ERP NLP Utils - Specialized for Egyptian Arabic
 */

const INTENTS = {
  INVOICE: ['فاتورة', 'بيع', 'أوردر', 'اوردر', 'جديدة', 'جديده'],
  CUSTOMER_CREATE: ['جديد', 'ضيف', 'سجل', 'اضافة', 'اضافه', 'انشاء'],
  CUSTOMER_UPDATE: ['عدل', 'تعديل', 'بيانات', 'تحديث', 'غير'],
  SAVE: ['احفظ', 'سجل', 'سيف', 'تمام', 'خلص'],
  SEARCH: ['فين', 'شوفلي', 'دور', 'عايز', 'هات'],
  CLEAR: ['امسح', 'فضلي', 'شيل']
};

const NUMBERS_MAP = {
  'واحد': 1, 'واحدة': 1, 'اتنين': 2, 'تلاتة': 3, 'تلاته': 3, 'اربعة': 4, 'خمسة': 5, 
  'ستة': 6, 'سبعة': 7, 'تمانية': 8, 'تسعة': 9, 'عشرة': 10, 'دستة': 12, 'كيلو': 1
};

/**
 * Clean and normalize Arabic text
 */
export const normalizeText = (text) => {
  if (!text) return '';
  // Convert Arabic numerals to standard digits
  const arabicDigits = /[٠١٢٣٤٥٦٧٨٩]/g;
  const standardText = text.replace(arabicDigits, (d) => d.charCodeAt(0) - 1632);

  return standardText
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
};

/**
 * Extract intent from text
 */
export const detectIntent = (text) => {
  const normalized = normalizeText(text);
  
  if (INTENTS.SAVE.some(k => normalized.includes(k))) return 'SAVE';
  if (INTENTS.INVOICE.some(k => normalized.includes(k))) return 'CREATE_INVOICE';
  
  // Custom logic for customers to distinguish between CREATE and UPDATE
  const hasCustomerKeyword = normalized.includes('عميل') || normalized.includes('زبون') || normalized.includes('تليفون') || normalized.includes('رقم');
  if (hasCustomerKeyword) {
    if (INTENTS.CUSTOMER_CREATE.some(k => normalized.includes(k))) return 'CREATE_CUSTOMER';
    if (INTENTS.CUSTOMER_UPDATE.some(k => normalized.includes(k))) return 'UPDATE_CUSTOMER';
  } else if (INTENTS.CUSTOMER_UPDATE.some(k => normalized.includes(k))) {
    return 'UPDATE_CUSTOMER';
  }

  if (INTENTS.CLEAR.some(k => normalized.includes(k))) return 'CLEAR';
  
  return 'SEARCH';
};

/**
 * Extract entities (names, numbers) from text
 */
export const extractEntities = (text) => {
  const normalized = normalizeText(text);
  const entities = { 
    customerName: null, 
    productName: null, 
    quantity: 1, 
    phone: null 
  };

  // 1. Extract Quantity
  const numMatch = normalized.match(/(\d+)/);
  if (numMatch && !normalized.includes('تليفون') && numMatch[1].length < 5) {
    entities.quantity = parseInt(numMatch[1], 10);
  } else {
    Object.keys(NUMBERS_MAP).forEach(word => {
      if (normalized.includes(word)) entities.quantity = NUMBERS_MAP[word];
    });
  }

  // 2. Extract Phone Number (Egyptian format: 010, 011, 012, 015)
  const phoneMatch = normalized.match(/(0?1[0125][0-9]{8})/);
  if (phoneMatch) {
    entities.phone = phoneMatch[1].startsWith('0') ? phoneMatch[1] : `0${phoneMatch[1]}`;
  }

  // 3. Extract Customer Name
  const customerTriggers = ['لعميل', 'باسم', 'بتاع', 'العميل', 'زبون', 'اسم'];
  customerTriggers.forEach(trig => {
    if (normalized.includes(trig)) {
      const parts = normalized.split(trig);
      if (parts[1]) {
        // Take next 1-2 words as name
        const namePart = parts[1].trim().split(' ').slice(0, 2).join(' ');
        if (namePart && !entities.customerName) entities.customerName = namePart;
      }
    }
  });

  return entities;
};

/**
 * Main parser function
 */
export const parseEgyptianCommand = (transcript) => {
  const intent = detectIntent(transcript);
  const entities = extractEntities(transcript);
  
  return {
    transcript,
    intent,
    entities,
    isAction: ['SAVE', 'CREATE_INVOICE', 'CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'CLEAR'].includes(intent)
  };
};

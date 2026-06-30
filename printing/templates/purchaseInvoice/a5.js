import { generatePurchaseInvoiceA4 } from './a4';
export const generatePurchaseInvoiceA5 = (props) => generatePurchaseInvoiceA4({ ...props, pageSize: 'A5' });

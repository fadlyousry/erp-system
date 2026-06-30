import { generateSaleInvoiceA4 } from './a4';

export const generateSaleInvoiceA5 = (props) => generateSaleInvoiceA4({ ...props, pageSize: 'A5' });

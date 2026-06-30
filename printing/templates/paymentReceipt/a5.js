import { generatePaymentReceiptA4 } from './a4';
export const generatePaymentReceiptA5 = (props) => generatePaymentReceiptA4({ ...props, pageSize: 'A5' });

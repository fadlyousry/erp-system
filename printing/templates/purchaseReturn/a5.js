import { generatePurchaseReturnA4 } from './a4';
export const generatePurchaseReturnA5 = (props) => generatePurchaseReturnA4({ ...props, pageSize: 'A5' });

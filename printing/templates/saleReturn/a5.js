import { generateSaleReturnA4 } from './a4';
export const generateSaleReturnA5 = (props) => generateSaleReturnA4({ ...props, pageSize: 'A5' });

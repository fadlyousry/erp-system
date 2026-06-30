import React from 'react';
import { Box, Layers, Warehouse, AlertTriangle } from 'lucide-react';

const ProductsMetrics = React.memo(({ metrics }) => (
    <section className="products-stats">
        <article className="products-stat-card">
            <div className="products-stat-icon is-total">
                <Box size={22} />
            </div>
            <div className="products-stat-info">
                <span className="products-stat-label">إجمالي الأصناف</span>
                <span className="products-stat-value">{metrics.productsCount.toLocaleString('ar-EG')}</span>
            </div>
        </article>
        
        <article className="products-stat-card">
            <div className="products-stat-icon is-variants">
                <Layers size={22} />
            </div>
            <div className="products-stat-info">
                <span className="products-stat-label">متغيرات الصفحة</span>
                <span className="products-stat-value">{metrics.variantsCount.toLocaleString('ar-EG')}</span>
            </div>
        </article>
        
        <article className="products-stat-card">
            <div className="products-stat-icon is-stock">
                <Warehouse size={22} />
            </div>
            <div className="products-stat-info">
                <span className="products-stat-label">إجمالي المخزون</span>
                <span className="products-stat-value">{metrics.stockTotal.toLocaleString('ar-EG')}</span>
            </div>
        </article>
        
        <article className="products-stat-card">
            <div className="products-stat-icon is-warning">
                <AlertTriangle size={22} />
            </div>
            <div className="products-stat-info">
                <span className="products-stat-label">منخفض/نافد</span>
                <span className="products-stat-value" style={{ color: '#dc2626' }}>
                    {metrics.lowStockCount.toLocaleString('ar-EG')}
                </span>
            </div>
        </article>
    </section>
));

ProductsMetrics.displayName = 'ProductsMetrics';
export default ProductsMetrics;


import React, { memo, useState } from 'react';
import { Users, AlertCircle, Landmark, Search, Printer, Eye, EyeOff } from 'lucide-react';

const CustomersQuickStats = memo(function CustomersQuickStats({
    totalCount,
    totalDebt,
    overdueCount,
    overdueThreshold,
    filteredCount,
    onPrintOverdue
}) {
    const [showDebt, setShowDebt] = useState(false);

    return (
        <div className="customers-stats">
            <div className="customers-stat-card">
                <div className="customers-stat-icon is-total">
                    <Users size={20} />
                </div>
                <div className="customers-stat-info">
                    <span className="customers-stat-label">إجمالي العملاء</span>
                    <span className="customers-stat-value">{totalCount}</span>
                </div>
            </div>
            
            <div className="customers-stat-card">
                <div className="customers-stat-icon is-overdue">
                    <AlertCircle size={20} />
                </div>
                <div className="customers-stat-info" style={{ flex: 1 }}>
                    <span className="customers-stat-label">عملاء متأخرين</span>
                    <span className="customers-stat-value is-overdue">{overdueCount}</span>
                    <span className="customers-stat-sub">مضى {overdueThreshold} يوم</span>
                </div>
                {overdueCount > 0 && onPrintOverdue && (
                    <button 
                        className="customers-stat-action"
                        onClick={onPrintOverdue}
                        title="طباعة تقرير المتأخرين"
                        style={{
                            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '8px',
                            cursor: 'pointer',
                            color: '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 4px rgba(220, 38, 38, 0.1)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.1)';
                        }}
                    >
                        <Printer size={18} />
                    </button>
                )}
            </div>

            <div className="customers-stat-card">
                <div className="customers-stat-icon is-vip">
                    <Landmark size={20} />
                </div>
                <div className="customers-stat-info" style={{ flex: 1 }}>
                    <span className="customers-stat-label">إجمالي المديونيات</span>
                    <span className="customers-stat-value is-vip" style={{ fontSize: showDebt ? '18px' : '14px' }}>
                        {showDebt ? (totalDebt?.toLocaleString() + ' ج.م') : '•••••••'}
                    </span>
                </div>
                <button 
                    onClick={() => setShowDebt(!showDebt)}
                    title={showDebt ? "إخفاء الرصيد" : "إظهار الرصيد"}
                    style={{
                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '8px',
                        cursor: 'pointer',
                        color: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(245, 158, 11, 0.1)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(245, 158, 11, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(245, 158, 11, 0.1)';
                    }}
                >
                    {showDebt ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>

            <div className="customers-stat-card">
                <div className="customers-stat-icon is-search">
                    <Search size={20} />
                </div>
                <div className="customers-stat-info">
                    <span className="customers-stat-label">نتائج البحث</span>
                    <span className="customers-stat-value">{filteredCount}</span>
                </div>
            </div>
        </div>
    );
});

export default CustomersQuickStats;

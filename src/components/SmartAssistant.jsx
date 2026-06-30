import React, { useState, useEffect, useRef } from 'react';
import { usePermissions } from '../context/PermissionsContext';
import { parseEgyptianCommand } from '../utils/nlp-utils';
import { emitPosEditorRequest } from '../utils/posEditorBridge';
import { emitCustomerCommand } from '../utils/customerBridge';

const COMMANDS = [
  // Navigation
  { id: 'nav-dashboard', type: 'nav', page: 'dashboard', keywords: ['رئيسية', 'لوحة', 'تحكم', 'dashboard', 'home', 'الرئيسية'], label: 'لوحة التحكم', icon: '📊', description: 'عرض الملخص العام والإحصائيات' },
  { id: 'nav-pos', type: 'nav', page: 'pos', keywords: ['بيع', 'فاتورة', 'كاشير', 'pos', 'sale', 'سريع', 'جديدة'], label: 'فاتورة بيع جديدة', icon: '🛒', description: 'فتح شاشة البيع السريع' },
  { id: 'nav-sales', type: 'nav', page: 'sales', keywords: ['مبيعات', 'سابقة', 'سجل', 'الفواتير', 'sales'], label: 'سجل المبيعات', icon: '📋', description: 'عرض وإدارة فواتير البيع السابقة' },
  { id: 'nav-purchases', type: 'nav', page: 'purchases', keywords: ['شراء', 'توريد', 'مشتريات', 'جديدة', 'purchase'], label: 'فاتورة مشتريات جديدة', icon: '📥', description: 'إضافة فاتورة مشتريات من مورد' },
  { id: 'nav-purchaseHistory', type: 'nav', page: 'purchaseHistory', keywords: ['مشتريات', 'سابقة', 'سجل', 'موردين', 'purchases'], label: 'سجل المشتريات', icon: '📚', description: 'عرض وإدارة فواتير المشتريات السابقة' },
  { id: 'nav-products', type: 'nav', page: 'products', keywords: ['صنف', 'أصناف', 'منتج', 'منتجات', 'مخزن', 'products', 'item'], label: 'الأصناف والمنتجات', icon: '📦', description: 'إدارة قائمة الأصناف والمخزون' },
  { id: 'nav-customers', type: 'nav', page: 'customers', keywords: ['عميل', 'عملاء', 'زبون', 'customers'], label: 'العملاء', icon: '👥', description: 'إدارة بيانات العملاء وحساباتهم' },
  { id: 'nav-suppliers', type: 'nav', page: 'suppliers', keywords: ['مورد', 'موردين', 'شركات', 'suppliers'], label: 'الموردين', icon: '🚚', description: 'إدارة بيانات الموردين والمستحقات' },
  { id: 'nav-treasury', type: 'nav', page: 'treasury', keywords: ['خزنة', 'خزينة', 'حسابات', 'مالية', 'فلوس', 'نقدي', 'treasury'], label: 'الخزينة والحسابات', icon: '🏦', description: 'عرض حركة النقدية والمصاريف' },
  { id: 'reports', label: 'التقارير والإحصائيات', description: 'بحث في التقارير والرسوم البيانية', icon: '📊', type: 'nav', page: 'reports', keywords: ['تقرير', 'احصائيات', 'ارباح', 'خسائر'] },
  { id: 'finance-ai', label: 'تحليل الأداء المالي (AI)', description: 'رؤية ذكية لأرباح ومصاريف المحل', icon: '🧠', type: 'ai-finance', keywords: ['تحليل', 'وضع مالي', 'ذكاء اصطناعي', 'نصيحة'] },
  { id: 'customers', label: 'إدارة العملاء', description: 'بحث وإضافة عملاء جدد', icon: '👥', page: 'customers', type: 'nav', keywords: ['عميل', 'زبون', 'مديونيات'] },
  { id: 'nav-settings', type: 'nav', page: 'settings', keywords: ['إعدادات', 'ضبط', 'تغيير', 'نطام', 'settings'], label: 'إعدادات النظام', icon: '⚙️', description: 'تغيير إعدادات المؤسسة والبرنامج' },
  
  // Quick Actions (Specific reports)
  { id: 'report-movement', type: 'nav', page: 'reports_item_movement', keywords: ['حركة', 'صنف', 'تتبع', 'مخزن'], label: 'تقرير حركة صنف', icon: '🔄', description: 'تتبع دخول وخروج صنف معين' },
  { id: 'nav-activity', type: 'nav', page: 'activityLog', keywords: ['سجل', 'عمليات', 'مراقبة', 'log'], label: 'سجل العمليات', icon: '📜', description: 'مراقبة تحركات المستخدمين' }
];

const SmartAssistant = ({ isOpen, onClose, onNavigate, onOpenFinancialDoctor, hasPermission }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dynamicResults, setDynamicResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Check for AI Intent to show a hint
  const aiAnalysis = query.trim().length > 3 ? parseEgyptianCommand(query) : null;
  const isAiAction = aiAnalysis && aiAnalysis.isAction;

  // Combine static commands and dynamic search results
  const filteredCommands = [
    ...(isAiAction ? [{
      id: 'ai-intent',
      type: 'ai',
      label: `✨ تنفيذ أمر: ${
        aiAnalysis.intent === 'CREATE_INVOICE' ? 'إنشاء فاتورة جديدة' :
        aiAnalysis.intent === 'CREATE_CUSTOMER' ? 'إضافة عميل جديد' :
        aiAnalysis.intent === 'UPDATE_CUSTOMER' ? 'تعديل بيانات عميل' :
        aiAnalysis.intent === 'SAVE' ? 'حفظ الفاتورة الحالية' : 'أمر ذكي'
      }`,
      description: `اضغط Enter لتنفيذ: "${query}"`,
      icon: '🤖',
      analysis: aiAnalysis
    }] : []),
    ...(query.trim() === '' 
      ? COMMANDS.slice(0, 5) 
      : COMMANDS.filter(cmd => {
          const search = query.toLowerCase();
          return (
            cmd.label.toLowerCase().includes(search) ||
            cmd.description.toLowerCase().includes(search) ||
            cmd.keywords.some(k => k.includes(search))
          );
        }).filter(cmd => !cmd.permission || hasPermission(cmd.permission))
    ),
    ...dynamicResults
  ];

  // Dynamic search logic
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setDynamicResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Search products and customers in parallel
        const [products, customers] = await Promise.all([
          window.api.getProducts({ searchTerm: query, limit: 3 }),
          window.api.getCustomers({ searchTerm: query, limit: 3 })
        ]);

        const results = [];
        
        if (products && !products.error && Array.isArray(products.data)) {
          products.data.forEach(p => {
            results.push({
              id: `prod-${p.id}`,
              type: 'nav',
              page: 'products',
              label: p.name,
              icon: '📦',
              description: `منتج - رصيد: ${p.inventory?.totalQuantity || 0} ${p.unitName}`,
              data: p
            });
          });
        }

        if (customers && !customers.error && Array.isArray(customers.data)) {
          customers.data.forEach(c => {
            results.push({
              id: `cust-${c.id}`,
              type: 'nav',
              page: 'customers',
              label: c.name,
              icon: '👥',
              description: `عميل - ${c.phone || 'بدون رقم'}`,
              data: c
            });
          });
        }

        setDynamicResults(results);
      } catch (err) {
        console.error('Smart search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, isOpen]);

  // Speech Recognition Setup
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'ar-EG';

    recognitionRef.current.onresult = (event) => {
      const current = event.resultIndex;
      const resultTranscript = event.results[current][0].transcript;
      setQuery(resultTranscript);
      
      if (event.results[current].isFinal) {
        setIsListening(false);
        handleVoiceCommand(resultTranscript);
      }
    };

    recognitionRef.current.onend = () => setIsListening(false);
    recognitionRef.current.onerror = () => setIsListening(false);

  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setQuery('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleVoiceCommand = (text) => {
    const analysis = parseEgyptianCommand(text);
    console.log('Voice Analysis:', analysis);
    
    if (analysis.intent === 'CREATE_INVOICE') {
      emitPosEditorRequest({
        voiceData: analysis.entities,
        reason: 'voice-command'
      });
      onClose();
    } else if (analysis.intent === 'CREATE_CUSTOMER') {
      onNavigate('customers');
      emitCustomerCommand({
        action: 'CREATE',
        data: {
          name: analysis.entities.customerName,
          phone: analysis.entities.phone
        }
      });
      onClose();
    } else if (analysis.intent === 'UPDATE_CUSTOMER') {
      onNavigate('customers');
      emitCustomerCommand({
        action: 'UPDATE',
        data: {
          name: analysis.entities.customerName,
          phone: analysis.entities.phone
        }
      });
      onClose();
    } else if (analysis.intent === 'SAVE') {
      window.dispatchEvent(new CustomEvent('erp:voice-save'));
      onClose();
    } else if (analysis.intent === 'SEARCH' && analysis.transcript.includes('تحليل')) {
      handleFinanceAI();
    }
  };

  const handleFinanceAI = async () => {
    if (onOpenFinancialDoctor) {
      onOpenFinancialDoctor();
      return;
    }
    // Fallback to simple summary if prop not provided
    setIsAnalyzing(true);
    try {
      const result = await window.api.getFinancialInsights();
      if (result && result.summary) {
        setFinanceSummary(result.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedCmd = filteredCommands[selectedIndex];
        if (selectedCmd) {
          executeCommand(selectedCmd);
        } else if (query.trim() !== '') {
          handleVoiceCommand(query);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, query]);

  useEffect(() => {
    const selectedElement = resultsRef.current?.children[selectedIndex];
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeCommand = (cmd) => {
    if (cmd.type === 'nav') {
      onNavigate(cmd.page);
      onClose();
    } else if (cmd.type === 'ai') {
      handleVoiceCommand(query);
    } else if (cmd.type === 'ai-finance') {
      handleFinanceAI();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="assistant-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div 
        className="assistant-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '600px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={toggleListening}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              fontSize: '24px', 
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            {isListening ? (
              <span className="listening-pulse">🛑</span>
            ) : (
              '🎙️'
            )}
          </button>
          <input 
            ref={inputRef}
            type="text"
            placeholder={isListening ? 'جاري الاستماع...' : 'اكتب ما تبحث عنه (مثلاً: بيع، منتجات، رصيد...)'}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '18px',
              fontFamily: 'inherit',
              color: '#1e293b'
            }}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            <kbd style={{ padding: '2px 6px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', color: '#64748b' }}>CTRL + K</kbd>
          </div>
        </div>

        {/* Results Area */}
        <div 
          ref={resultsRef}
          className="assistant-results no-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px'
          }}
        >
          {isAnalyzing && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6366f1' }}>
              <div className="pulse" style={{ marginBottom: '10px' }}>🧠 جاري تحليل الأرقام والبيانات...</div>
            </div>
          )}

          {financeSummary && !isAnalyzing && (
            <div style={{ 
              margin: '10px 20px', 
              padding: '20px', 
              background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', 
              borderRadius: '15px',
              border: '1px solid #ddd6fe',
              color: '#4338ca',
              fontSize: '15px',
              lineHeight: '1.6',
              position: 'relative'
            }}>
              <button 
                onClick={() => setFinanceSummary(null)}
                style={{ position: 'absolute', left: '10px', top: '10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
              >✕</button>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '17px' }}>رؤية المساعد المالي ✨</div>
              {financeSummary}
            </div>
          )}

          {filteredCommands.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>🤷‍♂️</div>
              <div>عذراً، لم أجد نتائج مطابقة لـ "{query}"</div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>جرب كلمات أخرى مثل: فاتورة، مخزن، تقرير</div>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div 
                key={cmd.id}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  backgroundColor: selectedIndex === index ? '#f8fafc' : 'transparent',
                  border: selectedIndex === index ? '1px solid #e2e8f0' : '1px solid transparent',
                  transition: 'all 0.1s'
                }}
              >
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '10px', 
                  backgroundColor: selectedIndex === index ? '#3b82f6' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  transition: 'background-color 0.2s'
                }}>
                  {cmd.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: selectedIndex === index ? '#1e293b' : '#475569', fontSize: '15px' }}>
                    {cmd.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {cmd.description}
                  </div>
                </div>
                {selectedIndex === index && (
                  <div style={{ fontSize: '18px', color: '#3b82f6' }}>⏎</div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
          <div>استخدم الأسهم ⇅ للتنقل و Enter للاختيار</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            مساعد ERP الذكي ✨
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .assistant-modal {
          animation: slideDown 0.2s ease-out;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .listening-pulse {
          display: inline-block;
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default SmartAssistant;

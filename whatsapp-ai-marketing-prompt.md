# برومبت نظام التسويق الذكي على واتساب
## لـ ERP محلات الملابس — React + Electron

---

## الجزء الأول: الـ Backend (Node.js / Electron Main Process)

### 📁 `main/aiMarketing.js`

```javascript
const Groq = require('groq-sdk');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { ipcMain } = require('electron');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ==========================================
// 1. واتساب Client (whatsapp-web.js مجاني)
// ==========================================
let whatsappClient = null;
let whatsappReady = false;

function initWhatsApp(mainWindow) {
  whatsappClient = new Client({
    authStrategy: new LocalAuth({ clientId: 'erp-marketing' }),
    puppeteer: { headless: true }
  });

  // لما يطلع QR Code — بنبعته للـ React عشان يعرضه
  whatsappClient.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    mainWindow.webContents.send('whatsapp-qr', qr);
  });

  whatsappClient.on('ready', () => {
    whatsappReady = true;
    mainWindow.webContents.send('whatsapp-status', 'connected');
    console.log('واتساب متصل ✅');
  });

  whatsappClient.on('disconnected', () => {
    whatsappReady = false;
    mainWindow.webContents.send('whatsapp-status', 'disconnected');
  });

  whatsappClient.initialize();
}

// ==========================================
// 2. الـ AI يكتب الرسالة التسويقية
// ==========================================
async function generateMarketingMessage(product) {
  const prompt = `
أنت خبير تسويق متخصص في محلات الملابس المصرية.

اكتب رسالة واتساب تسويقية قصيرة وجذابة للمنتج الجديد التالي:
- اسم المنتج: ${product.name}
- الفئة: ${product.category}
- السعر: ${product.price} جنيه
- الألوان المتاحة: ${product.colors?.join('، ') || 'متعددة'}
- المقاسات: ${product.sizes?.join('، ') || 'S, M, L, XL'}
- أي تفاصيل إضافية: ${product.description || 'لا يوجد'}

قواعد الرسالة:
- ابدأ بتحية قصيرة ومحترمة
- اذكر اسم المنتج بوضوح
- ركز على السعر والقيمة
- استخدم إيموجي مناسبة (3-4 بس مش أكتر)
- الرسالة لازم تكون مختصرة (4-6 أسطر بالكتير)
- أضف في الآخر "للاستفسار والطلب تواصل معنا" 
- الأسلوب: عربي مصري بسيط ومحترم

اكتب الرسالة فقط بدون أي شرح أو مقدمة.
`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  });

  return response.choices[0].message.content.trim();
}

// ==========================================
// 3. إرسال الرسالة للجروب
// ==========================================
async function sendToGroup(groupName, message) {
  if (!whatsappReady) throw new Error('واتساب مش متصل');

  const chats = await whatsappClient.getChats();
  const group = chats.find(
    (c) => c.isGroup && c.name.includes(groupName)
  );

  if (!group) throw new Error(`مش لاقي جروب اسمه: ${groupName}`);

  await group.sendMessage(message);
  return true;
}

// ==========================================
// 4. الـ IPC Events — الـ React بيكلم Main
// ==========================================
function setupMarketingIPC(mainWindow) {
  initWhatsApp(mainWindow);

  // لما الموظف يضيف منتج جديد ويضغط "إرسال حملة"
  ipcMain.handle('send-marketing-campaign', async (event, { product, groupName }) => {
    try {
      // الـ AI يكتب الرسالة
      const message = await generateMarketingMessage(product);

      // بعتها للجروب
      await sendToGroup(groupName, message);

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // معاينة الرسالة بدون إرسال
  ipcMain.handle('preview-marketing-message', async (event, { product }) => {
    try {
      const message = await generateMarketingMessage(product);
      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // جيب قائمة الجروبات المتاحة
  ipcMain.handle('get-whatsapp-groups', async () => {
    try {
      if (!whatsappReady) return { success: false, error: 'واتساب مش متصل' };
      const chats = await whatsappClient.getChats();
      const groups = chats
        .filter((c) => c.isGroup)
        .map((c) => ({ id: c.id._serialized, name: c.name }));
      return { success: true, groups };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupMarketingIPC };
```

---

### 📁 `main/index.js` — أضف السطرين دول

```javascript
const { setupMarketingIPC } = require('./aiMarketing');

app.whenReady().then(() => {
  const mainWindow = createWindow();
  setupMarketingIPC(mainWindow); // ← أضف السطر ده
});
```

---

## الجزء الثاني: الـ Frontend (React)

### 📁 `src/components/MarketingPanel.jsx`

```jsx
import { useState, useEffect } from 'react';

export default function MarketingPanel({ product }) {
  const [status, setStatus] = useState('disconnected'); // connected | disconnected | loading
  const [qrCode, setQrCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [preview, setPreview] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // استقبال أحداث واتساب من Main Process
  useEffect(() => {
    window.electron.ipcRenderer.on('whatsapp-qr', (qr) => {
      setQrCode(qr);
      setStatus('qr');
    });

    window.electron.ipcRenderer.on('whatsapp-status', (s) => {
      setStatus(s);
      if (s === 'connected') {
        setQrCode(null);
        loadGroups();
      }
    });
  }, []);

  // جيب الجروبات لما واتساب يتصل
  async function loadGroups() {
    const res = await window.electron.ipcRenderer.invoke('get-whatsapp-groups');
    if (res.success) setGroups(res.groups);
  }

  // معاينة الرسالة
  async function handlePreview() {
    setPreview('...');
    const res = await window.electron.ipcRenderer.invoke('preview-marketing-message', { product });
    if (res.success) setPreview(res.message);
  }

  // إرسال الحملة
  async function handleSend() {
    if (!selectedGroup) return alert('اختار جروب الأول');
    setSending(true);
    setResult(null);

    const res = await window.electron.ipcRenderer.invoke('send-marketing-campaign', {
      product,
      groupName: selectedGroup,
    });

    setSending(false);
    setResult(res);
    if (res.success) setPreview(res.message);
  }

  return (
    <div style={{ padding: 20, maxWidth: 500 }}>
      <h3>📢 حملة تسويقية — {product?.name}</h3>

      {/* حالة واتساب */}
      <div style={{ marginBottom: 16 }}>
        {status === 'connected' && (
          <span style={{ color: 'green' }}>✅ واتساب متصل</span>
        )}
        {status === 'disconnected' && (
          <span style={{ color: 'red' }}>❌ واتساب مش متصل — افتح التطبيق وامسح الـ QR</span>
        )}
        {status === 'qr' && qrCode && (
          <div>
            <p>امسح الـ QR بواتساب:</p>
            {/* مكتبة qrcode.react لعرض الـ QR */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=200x200`} alt="QR Code" />
          </div>
        )}
      </div>

      {/* اختيار الجروب */}
      {status === 'connected' && (
        <>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8 }}
          >
            <option value="">اختار جروب واتساب...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.name}>{g.name}</option>
            ))}
          </select>

          {/* معاينة الرسالة */}
          <button onClick={handlePreview} style={{ marginBottom: 8, marginLeft: 8 }}>
            👁 معاينة الرسالة
          </button>

          {/* إرسال */}
          <button
            onClick={handleSend}
            disabled={sending}
            style={{ backgroundColor: '#25D366', color: 'white', padding: '8px 16px' }}
          >
            {sending ? '⏳ بيبعت...' : '📤 إرسال للجروب'}
          </button>

          {/* معاينة نص الرسالة */}
          {preview && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: '#f0f0f0',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              direction: 'rtl'
            }}>
              <strong>الرسالة:</strong>
              <p>{preview}</p>
            </div>
          )}

          {/* نتيجة الإرسال */}
          {result && (
            <div style={{ marginTop: 12, color: result.success ? 'green' : 'red' }}>
              {result.success ? '✅ اتبعتت بنجاح!' : `❌ خطأ: ${result.error}`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

## الجزء الثالث: الاستخدام في صفحة المنتجات

### في أي صفحة عندك منتجات — أضف الـ Panel ده

```jsx
import MarketingPanel from './components/MarketingPanel';

// لما الموظف يفتح منتج أو يضيف منتج جديد:
const selectedProduct = {
  name: 'جينز أزرق سليم فيت',
  category: 'بناطيل',
  price: 350,
  colors: ['أزرق فاتح', 'أزرق غامق'],
  sizes: ['S', 'M', 'L', 'XL'],
  description: 'قماش عالي الجودة، مريح للإرتداء اليومي'
};

return (
  <div>
    {/* باقي صفحة المنتج */}
    <MarketingPanel product={selectedProduct} />
  </div>
);
```

---

## التثبيت

```bash
# مكتبة واتساب المجانية
npm install whatsapp-web.js qrcode-terminal

# مكتبة الـ AI
npm install groq-sdk

# في ملف .env
GROQ_API_KEY=your_key_here
```

---

## ملاحظات مهمة

| موضوع | التفصيل |
|-------|---------|
| الـ QR Code | أول مرة بس — بعدها واتساب بيتذكر تلقائي |
| خطر الحظر | ابعت مش أكتر من 5-10 رسائل في اليوم في البداية |
| الجروب | لازم الرقم اللي شغّل التطبيق يكون في الجروب |
| الـ Groq | سجّل على groq.com واحصل على API key مجاني |
| البديل الرسمي | لما المحل يكبر انتقل لـ WhatsApp Business API |

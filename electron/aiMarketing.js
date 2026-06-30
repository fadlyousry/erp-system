const { ipcMain } = require('electron');
const { getWhatsAppService } = require('./whatsapp-service');
const Groq = require('groq-sdk');
const { readSystemConfig } = require('./system-config');
const { app } = require('electron');

async function getGroqClient() {
    const config = await readSystemConfig(app);
    const apiKey = config?.marketingSettings?.groqApiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error('مفتاح Groq API غير متوفر. يرجى إضافته في إعدادات النظام.');
    }

    return new Groq({ apiKey });
}

async function generateGemini(prompt, apiKey) {
    const endpoints = [
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
    ];

    let lastError = null;

    for (const url of endpoints) {
        try {
            console.log(`[aiMarketing] Attempting Gemini API request to: ${url.split('?')[0]}`);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 600,
                        temperature: 0.7
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    console.log('[aiMarketing] Gemini API request succeeded.');
                    return text.trim();
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                lastError = errorData.error?.message || response.statusText;
                
                // اعتراض أخطاء الحصة والمفاتيح الجديدة لتوجيه المستخدم بلطف
                if (
                    String(lastError).toLowerCase().includes('quota') || 
                    String(lastError).toLowerCase().includes('rate limit') || 
                    String(lastError).toLowerCase().includes('limit: 0') ||
                    response.status === 429
                ) {
                    throw new Error('مفتاح الـ API جديد وجاري تفعيله بالكامل على خوادم جوجل (يستغرق عادةً 1-2 دقيقة عند أول إنشاء)، أو تم تجاوز الحد المجاني المسموح به في الدقيقة. يرجى الانتظار 10 ثوانٍ والمحاولة مرة أخرى ⏱️');
                }
                console.warn(`[aiMarketing] Endpoint failed with error: ${lastError}`);
            }
        } catch (e) {
            // إذا كان الخطأ هو خطأ الحصة الموجه للمستخدم، نقوم بتمريره مباشرة دون استمرار اللوب
            if (e.message.includes('⏱️')) {
                throw e;
            }
            lastError = e.message;
            console.warn(`[aiMarketing] Connection failed to ${url.split('?')[0]}: ${e.message}`);
        }
    }

    throw new Error(`Gemini API Error: ${lastError || 'تعذر الاتصال بجميع خوادم جيميناي'}`);
}

function registerAiMarketingHandlers() {
    ipcMain.handle('ai-marketing:generate', async (event, { product, customPrompt, targetCustomerType }) => {
        try {
            const config = await readSystemConfig(app);
            const provider = config?.marketingSettings?.provider || 'gemini';
            const shopName = config?.companyName || 'محل ملابس مميز';
            
            const prompt = customPrompt || `
أنت خبير تسويق محترف ومتخصص في محلات الملابس المصرية. اسم المحل هو: "${shopName}".

اكتب رسالة واتساب تسويقية قصيرة، جذابة وراقية جداً للمنتج التالي:
- اسم المنتج: ${product.name || 'منتج جديد'}
- السعر: ${product.price || 'سعر مميز'} جنيه
- الألوان: ${product.colors?.join('، ') || 'ألوان متعددة'}
- المقاسات: ${product.sizes?.join('، ') || 'مقاسات متنوعة'}
- تفاصيل إضافية: ${product.description || 'لا يوجد'}

الفئة المستهدفة من العملاء: ${targetCustomerType || 'جميع العملاء'}

قواعد الرسالة:
- ابدأ بتحية دافئة واذكر اسم المحل "${shopName}" بصياغة ودية ولطيفة.
- اذكر اسم المنتج ومميزاته بوضوح تام، واجعل الوصف مشوقاً ومحفزاً للشراء.
- إذا كانت الفئة المستهدفة هي "عملاء الجملة"، ركز على أسعار الجملة المغرية والخصومات للكميات.
- إذا كانت الفئة المستهدفة هي "عملاء VIP"، استخدم أسلوباً راقياً يبرز التميز والجودة العالية والقطع الحصرية.
- إذا كانت الفئة المستهدفة هي "عملاء القطاعي (عادي)"، ركز على الموضة، السعر المناسب للجميع، وجمال القطعة للاستخدام اليومي أو المناسبات.
- استخدم إيموجي مناسبة (3-4 كحد أقصى).
- أضف "للاستفسار والطلب تواصل معنا" في النهاية.
- الأسلوب: عربي مصري بسيط، محترم، ودود وجذاب للغاية للعملاء.
- الرسالة يجب أن تكون من 4 لـ 6 أسطر.

اكتب النص فقط دون أي مقدمات أو شروحات.
`;

            let message = '';
            if (provider === 'gemini') {
                const apiKey = config?.marketingSettings?.geminiApiKey || process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    throw new Error('مفتاح Google Gemini API غير متوفر. يرجى إضافته في إعدادات النظام.');
                }
                message = await generateGemini(prompt, apiKey);
            } else {
                const groq = await getGroqClient();
                const response = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 300,
                });
                message = response.choices[0]?.message?.content?.trim();
            }

            return { success: true, message };
        } catch (error) {
            console.error('[aiMarketing] Generation error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('ai-marketing:getGroups', async () => {
        try {
            const wa = getWhatsAppService();
            if (!wa.getStatus().isConnected || !wa.client) {
                return { success: false, error: 'واتساب غير متصل.' };
            }

            const chats = await wa.client.getChats();
            const groups = chats
                .filter(c => c.isGroup)
                .map(c => ({ id: c.id._serialized, name: c.name }));

            return { success: true, groups };
        } catch (error) {
            console.error('[aiMarketing] getGroups error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('ai-marketing:sendToGroup', async (event, { groupId, message, base64Image }) => {
        try {
            const wa = getWhatsAppService();
            if (!wa.getStatus().isConnected || !wa.client) {
                return { success: false, error: 'واتساب غير متصل.' };
            }

            if (base64Image) {
                const { MessageMedia } = require('whatsapp-web.js');
                const media = new MessageMedia('image/png', base64Image, 'product.png');
                await wa.client.sendMessage(groupId, media, { caption: message });
            } else {
                await wa.client.sendMessage(groupId, message);
            }

            return { success: true };
        } catch (error) {
            console.error('[aiMarketing] sendToGroup error:', error);
            return { success: false, error: error.message };
        }
    });
    
    // إرسال لجهات اتصال محددة (أو أرقام)
    ipcMain.handle('ai-marketing:sendToNumbers', async (event, { numbers, message, base64Image }) => {
        try {
            const wa = getWhatsAppService();
            if (!wa.getStatus().isConnected || !wa.client) {
                return { success: false, error: 'واتساب غير متصل.' };
            }

            let sentCount = 0;
            let failedCount = 0;

            for (const number of numbers) {
                // استخدام دالة التحويل الموجودة في خدمة الواتساب
                const { phoneToWhatsAppId } = require('./whatsapp-service');
                const chatId = phoneToWhatsAppId(number);
                
                if (!chatId) {
                    failedCount++;
                    continue;
                }

                try {
                    if (base64Image) {
                        const { MessageMedia } = require('whatsapp-web.js');
                        const media = new MessageMedia('image/png', base64Image, 'product.png');
                        await wa.client.sendMessage(chatId, media, { caption: message });
                    } else {
                        await wa.client.sendMessage(chatId, message);
                    }
                    sentCount++;
                    // Rate limit simple
                    await new Promise(r => setTimeout(r, 2000));
                } catch (err) {
                    failedCount++;
                }
            }

            return { success: true, sentCount, failedCount };
        } catch (error) {
            console.error('[aiMarketing] sendToNumbers error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('ai-marketing:getSettings', async () => {
        try {
            const config = await readSystemConfig(app);
            return {
                success: true,
                settings: config?.marketingSettings || {
                    provider: 'gemini',
                    geminiApiKey: '',
                    groqApiKey: ''
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('ai-marketing:saveSettings', async (event, settings) => {
        try {
            const { writeSystemConfig } = require('./system-config');
            await writeSystemConfig(app, {
                marketingSettings: {
                    provider: String(settings?.provider || 'gemini').trim(),
                    geminiApiKey: String(settings?.geminiApiKey || '').trim(),
                    groqApiKey: String(settings?.groqApiKey || '').trim()
                }
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerAiMarketingHandlers };

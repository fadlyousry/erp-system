import React, { useState, useEffect, useRef } from 'react';
import { usePermissions } from '../context/PermissionsContext';

const ChatWidget = ({ currentUser }) => {
  const { hasPermission } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const pollingRef = useRef(null);
  const lastMessageCountRef = useRef(0);

  // Play notification sound
  const playNotificationSound = () => {
    try {
      // Small "bubble pop" sound in base64
      const bubblePopBase64 = 'data:audio/wav;base64,UklGRmYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YUIAAAD//wEAAAAAAP//AQAAAAAA//8BAAAAAAD//wEAAAAAAP//AQAAAAAA//8BAAAAAAD//wEAAAAAAP//AQAAAAAA//8BAAAAAA=='; 
      // Using a slightly more robust public source if the base64 is too silent, but adding it to CSP is better.
      // For now, let's use a standard beep if base64 fails or just a local-like data uri.
      const audio = new Audio(bubblePopBase64);
      audio.play().catch(e => console.log('Sound play blocked by browser:', e));
    } catch (err) {
      console.error('Failed to play sound:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (isInitial = false) => {
    try {
      const result = await window.api.getChatMessages(50);
      if (result && !result.error) {
        setMessages(result);
        
        // If we have more messages than before, play sound and show notification
        if (result.length > lastMessageCountRef.current && !isInitial) {
          playNotificationSound();
          if (!isOpen) setHasUnread(true);
        }
        
        lastMessageCountRef.current = result.length;
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || loading) return;

    setLoading(true);
    try {
      const result = await window.api.sendChatMessage(newMessage);
      if (result && !result.error) {
        setNewMessage('');
        await fetchMessages();
      } else if (result && result.error) {
        alert(result.error);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('حدث خطأ أثناء إرسال الرسالة');
    } finally {
      setLoading(false);
    }
  };

  const isManager = currentUser?.role?.name === 'ADMIN' || hasPermission('roles:manage') || hasPermission('users:manage');

  const handleDeleteMessage = async (messageId) => {
    try {
      const result = await window.api.deleteChatMessage(messageId);
      if (result && !result.error) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      } else {
        alert(result?.error || 'فشل حذف الرسالة');
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع الرسائل نهائياً؟')) return;
    try {
      const result = await window.api.deleteAllChatMessages();
      if (result && !result.error) {
        setMessages([]);
      } else {
        alert(result?.error || 'فشل مسح الشات');
      }
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  useEffect(() => {
    if (!hasPermission('chat:view') || !isOpen) return;

    fetchMessages(true);
    pollingRef.current = setInterval(() => fetchMessages(), 15000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [hasPermission, isOpen]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setHasUnread(false);
    }
  }, [messages, isOpen]);

  if (!hasPermission('chat:view')) return null;

  return (
    <div 
      className="chat-widget-container" 
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px', // Opposite of the right sidebar
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start'
      }}
    >
      {/* Chat Window */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            bottom: '80px',
            left: 0,
            width: '350px',
            height: '450px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          {/* Header */}
          <div 
            style={{
              padding: '12px 15px',
              backgroundColor: '#1e293b',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>💬</span>
              <span style={{ fontWeight: 'bold' }}>الدردشة الجماعية</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {isManager && (
                <button 
                  onClick={handleClearChat}
                  title="مسح جميع الرسائل"
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    color: '#fca5a5', 
                    fontSize: '11px', 
                    padding: '4px 8px', 
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#fca5a5'; }}
                >
                  🧹 مسح الكل
                </button>
              )}
              <button 
                onClick={() => setIsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            className="no-scrollbar"
            style={{
              flex: 1,
              padding: '15px',
              overflowY: 'auto',
              backgroundColor: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '20px', fontSize: '13px' }}>
                لا توجد رسائل بعد. ابدأ المحادثة!
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === currentUser?.id;
                return (
                  <div 
                    key={msg.id} 
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start'
                    }}
                  >
                    {!isMe && (
                      <span style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px', marginRight: '4px' }}>
                        {msg.sender?.name}
                      </span>
                    )}
                    <div 
                      className="message-bubble"
                      style={{
                        position: 'relative',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        backgroundColor: isMe ? '#3b82f6' : 'white',
                        color: isMe ? 'white' : '#1e293b',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        fontSize: '14px',
                        lineHeight: '1.4',
                        border: isMe ? 'none' : '1px solid #e2e8f0',
                        borderTopRightRadius: isMe ? '2px' : '12px',
                        borderTopLeftRadius: isMe ? '12px' : '2px',
                        group: 'hover'
                      }}
                    >
                      {msg.content}
                      {(isMe || isManager) && (
                        <button 
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="delete-msg-btn"
                          title="حذف الرسالة"
                          style={{
                            position: 'absolute',
                            top: '50%',
                            right: isMe ? '-32px' : 'auto',
                            left: isMe ? 'auto' : '-32px',
                            transform: 'translateY(-50%) scale(0.9)',
                            backgroundColor: 'white',
                            border: '1px solid #fee2e2',
                            borderRadius: '8px',
                            width: '26px',
                            height: '26px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0,
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            color: '#ef4444',
                            zIndex: 10
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                      {new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form 
            onSubmit={handleSend}
            style={{
              padding: '12px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '8px',
              backgroundColor: 'white'
            }}
          >
            <input 
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '20px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button 
              disabled={!newMessage.trim() || loading}
              style={{
                width: '35px',
                height: '35px',
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: newMessage.trim() ? 'pointer' : 'default',
                opacity: newMessage.trim() ? 1 : 0.6,
                padding: 0,
                fontSize: '18px'
              }}
            >
              🚀
            </button>
          </form>
        </div>
      )}

      {/* Floating Button */}
      <button 
        className="chat-toggle-button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#1e293b',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          position: 'relative',
          transition: 'all 0.3s ease-in-out',
          opacity: isOpen ? 1 : 0.4,
          transform: isOpen ? 'scale(0.9)' : 'scale(1)'
        }}
      >
        💬
        {hasUnread && (
          <span 
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              width: '18px',
              height: '18px',
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              border: '2px solid white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          />
        )}
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-toggle-button:hover {
          opacity: 1 !important;
          transform: scale(1.1) !important;
        }
        .message-bubble:hover .delete-msg-btn {
          opacity: 1 !important;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default ChatWidget;

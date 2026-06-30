import React, { useState, useEffect } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    roleId: '',
    warehouseId: ''
  });

  // Get current user from localStorage
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  })();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, warehousesData] = await Promise.all([
        window.api.getUsers(),
        window.api.getRoles(),
        window.api.getWarehouses()
      ]);
      
      if (!usersData.error) setUsers(usersData);
      if (!rolesData.error) {
        setRoles(rolesData);
        if (rolesData.length > 0 && !formData.roleId) {
            setFormData(prev => ({ ...prev, roleId: rolesData[0].id }));
        }
      }
      if (warehousesData && !warehousesData.error) {
        setWarehouses(warehousesData);
      }
    } catch (err) {
      console.error('فشل تحميل البيانات', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = { 
        ...formData, 
        roleId: parseInt(formData.roleId),
        warehouseId: formData.warehouseId ? parseInt(formData.warehouseId) : null
      };
      if (editingUser) {
        if (!dataToSave.password) delete dataToSave.password;
        const result = await window.api.updateUser(editingUser.id, dataToSave);
        if (result?.error) { safeAlert(result.error); return; }
      } else {
        const result = await window.api.addUser(dataToSave);
        if (result?.error) { safeAlert(result.error); return; }
      }
      loadData();
      setShowModal(false);
      setFormData({ name: '', username: '', password: '', roleId: roles[0]?.id || '', warehouseId: '' });
      setEditingUser(null);
    } catch (err) {
      safeAlert('خطأ في حفظ البيانات');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({ 
        name: user.name, 
        username: user.username, 
        password: '', 
        roleId: user.roleId || '',
        warehouseId: user.warehouseId || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (currentUser?.id === id) {
      safeAlert('لا يمكنك حذف حسابك الخاص.');
      return;
    }

    const confirmed = await safeConfirm('هل أنت متأكد من حذف هذا المستخدم؟', {
      title: 'تأكيد الحذف',
      buttons: ['حذف', 'إلغاء']
    });
    if (!confirmed) return;

    try {
      const result = await window.api.deleteUser(id);
      if (result?.error) {
          safeAlert(result.error);
      } else {
          loadData();
      }
    } catch (err) {
      safeAlert('خطأ في الحذف');
    }
  };

  const handleToggleActive = async (user) => {
    if (currentUser?.id === user.id) {
      safeAlert('لا يمكنك تعطيل حسابك الخاص.');
      return;
    }

    const action = user.isActive ? 'تعطيل' : 'تفعيل';
    const confirmed = await safeConfirm(`هل أنت متأكد من ${action} حساب "${user.name}"؟`, {
      title: `تأكيد ${action}`,
      buttons: [action, 'إلغاء']
    });
    if (!confirmed) return;

    try {
      const result = await window.api.updateUser(user.id, { 
        name: user.name, 
        username: user.username, 
        roleId: user.roleId, 
        isActive: !user.isActive 
      });
      if (result?.error) {
        safeAlert(result.error);
      } else {
        loadData();
      }
    } catch (err) {
      safeAlert('خطأ في تحديث الحالة');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-EG', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'لم يسجل دخول بعد';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    }) + ' ' + d.toLocaleTimeString('ar-EG', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const isSelf = (userId) => currentUser?.id === userId;

  if (loading) return <div className="p-10 text-center">جاري التحميل...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>👤 إدارة المستخدمين</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {users.length} مستخدم ({users.filter(u => u.isActive !== false).length} نشط)
          </span>
          <button
            onClick={() => {
              setShowModal(true);
              setEditingUser(null);
              setFormData({ name: '', username: '', password: '', roleId: roles[0]?.id || '', warehouseId: '' });
            }}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            + إضافة مستخدم جديد
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'right' }}>#</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>الاسم</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>اسم المستخدم</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>الدور</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>المخزن المسموح</th>
              <th style={{ padding: '15px', textAlign: 'center' }}>الحالة</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>آخر تسجيل دخول</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>تاريخ التسجيل</th>
              <th style={{ padding: '15px', textAlign: 'center' }}>العمليات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ 
                borderBottom: '1px solid #f3f4f6',
                opacity: user.isActive === false ? 0.6 : 1,
                backgroundColor: user.isActive === false ? '#fafafa' : 'transparent'
              }}>
                <td style={{ padding: '15px' }}>{user.id}</td>
                <td style={{ padding: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {user.name}
                    {isSelf(user.id) && (
                      <span style={{ 
                        fontSize: '10px', 
                        backgroundColor: '#dbeafe', 
                        color: '#1d4ed8', 
                        padding: '2px 6px', 
                        borderRadius: '4px' 
                      }}>أنت</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '15px', fontFamily: 'monospace', fontSize: '13px' }}>{user.username}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{
                    backgroundColor: '#e0e7ff',
                    color: '#4338ca',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}>
                    {user.role?.name || 'بدون دور'}
                  </span>
                </td>
                <td style={{ padding: '15px' }}>
                  {user.warehouse ? (
                    <span style={{
                      backgroundColor: '#fef3c7',
                      color: '#d97706',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}>
                      {user.warehouse.name}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>جميع المخازن</span>
                  )}
                </td>
                <td style={{ padding: '15px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: user.isActive !== false ? '#dcfce7' : '#fee2e2',
                    color: user.isActive !== false ? '#166534' : '#991b1b'
                  }}>
                    <span style={{ 
                      width: '6px', height: '6px', borderRadius: '50%', 
                      backgroundColor: user.isActive !== false ? '#22c55e' : '#ef4444' 
                    }}></span>
                    {user.isActive !== false ? 'نشط' : 'معطل'}
                  </span>
                </td>
                <td style={{ padding: '15px', fontSize: '13px', color: '#64748b' }}>
                  {formatDateTime(user.lastLoginAt)}
                </td>
                <td style={{ padding: '15px', fontSize: '13px' }}>
                  {formatDate(user.createdAt)}
                </td>
                <td style={{ padding: '15px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEdit(user)}
                      style={{
                        color: '#2563eb',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      تعديل
                    </button>
                    {!isSelf(user.id) && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        title={user.isActive !== false ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        style={{
                          color: user.isActive !== false ? '#f59e0b' : '#22c55e',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        {user.isActive !== false ? 'تعطيل' : 'تفعيل'}
                      </button>
                    )}
                    {!isSelf(user.id) && (
                      <button
                        onClick={() => handleDelete(user.id)}
                        style={{
                          color: '#ef4444',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '400px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '20px' }}>
              {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>الاسم *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db'
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>اسم المستخدم *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required={!editingUser}
                  disabled={editingUser}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: editingUser ? '#f3f4f6' : 'white'
                  }}
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>
                  كلمة المرور {!editingUser && '*'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? 'اتركها فارغة إذا لم ترد التغيير' : ''}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db'
                  }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>الدور *</label>
                <select
                  value={formData.roleId}
                  onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                  required
                  disabled={editingUser && isSelf(editingUser.id)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: (editingUser && isSelf(editingUser.id)) ? '#f3f4f6' : 'white'
                  }}
                >
                  <option value="" disabled>اختر الدور</option>
                  {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                {editingUser && isSelf(editingUser.id) && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>لا يمكنك تغيير دورك الخاص</p>
                )}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>المخزن المسموح (صلاحية محددة)</label>
                <select
                  value={formData.warehouseId || ''}
                  onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">جميع المخازن (غير مقيد)</option>
                  {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>
                  إذا تم الاختيار، سيتم تقييد المستخدم للبيع والشراء من هذا المخزن فقط.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

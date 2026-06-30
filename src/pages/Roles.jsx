import React, { useState, useEffect, useMemo } from 'react';
import { safeAlert } from '../utils/safeAlert';
import { safeConfirm } from '../utils/safeConfirm';

const GROUP_COLORS = {
  dashboard: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  pos:       { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  sales:     { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  returns:   { bg: '#fce7f3', color: '#9d174d', border: '#fbcfe8' },
  products:  { bg: '#f5f3ff', color: '#5b21b6', border: '#ddd6fe' },
  warehouses:{ bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
  customers: { bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
  suppliers: { bg: '#fdf2f8', color: '#831843', border: '#f9a8d4' },
  purchases: { bg: '#fff1f2', color: '#9f1239', border: '#fecdd3' },
  treasury:  { bg: '#f0f9ff', color: '#075985', border: '#bae6fd' },
  expenses:  { bg: '#fefce8', color: '#854d0e', border: '#fef08a' },
  users:     { bg: '#f8fafc', color: '#334155', border: '#cbd5e1' },
  roles:     { bg: '#f8fafc', color: '#334155', border: '#cbd5e1' },
  reports:   { bg: '#eef2ff', color: '#3730a3', border: '#c7d2fe' },
  activityLog: { bg: '#f1f5f9', color: '#475569', border: '#94a3b8' },
  settings:  { bg: '#f9fafb', color: '#374151', border: '#d1d5db' },
};

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissionIds: []
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesData, permsData] = await Promise.all([
        window.api.getRoles(),
        window.api.getPermissions()
      ]);
      
      if (!rolesData.error) setRoles(rolesData);
      if (!permsData.error) setPermissions(permsData);
    } catch (err) {
      console.error('فشل تحميل البيانات', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let result;
      if (editingRole) {
        result = await window.api.updateRole(editingRole.id, formData);
      } else {
        result = await window.api.addRole(formData);
      }
      if (result?.error) { safeAlert(result.error); return; }
      loadData();
      setShowModal(false);
      setFormData({ name: '', description: '', permissionIds: [] });
      setEditingRole(null);
      safeAlert('تم حفظ البيانات بنجاح');
    } catch (err) {
      safeAlert('خطأ في حفظ البيانات');
    }
  };

  const handleEdit = (role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions?.map(p => p.permissionId) || []
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await safeConfirm('هل أنت متأكد من حذف هذا الدور؟', {
      title: 'تأكيد الحذف',
      buttons: ['حذف', 'إلغاء']
    });
    if (!confirmed) return;

    try {
      const result = await window.api.deleteRole(id);
      if (result?.error) {
        safeAlert(result.error);
      } else {
        loadData();
      }
    } catch (err) {
      safeAlert('خطأ في الحذف');
    }
  };

  const togglePermission = (id) => {
    setFormData(prev => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(id)
        ? prev.permissionIds.filter(pId => pId !== id)
        : [...prev.permissionIds, id]
    }));
  };

  // Group permissions by prefix for better UI
  const groupedPermissions = useMemo(() => {
      const groups = {};
      permissions.forEach(p => {
          const groupName = p.key.split(':')[0] || 'عام';
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(p);
      });
      return groups;
  }, [permissions]);

  const groupLabels = {
      dashboard: 'لوحة التحكم',
      pos: 'شاشة البيع',
      sales: 'المبيعات',
      returns: 'المرتجعات',
      products: 'المنتجات',
      warehouses: 'المخازن',
      customers: 'العملاء',
      suppliers: 'الموردين',
      purchases: 'المشتريات',
      treasury: 'الخزينة',
      expenses: 'المصروفات',
      users: 'المستخدمين',
      roles: 'الصلاحيات',
      reports: 'التقارير',
      activityLog: 'سجل النشاط',
      settings: 'الإعدادات'
  };

  // Select all / deselect all for a group
  const toggleGroup = (groupPerms) => {
    const groupIds = groupPerms.map(p => p.id);
    const allSelected = groupIds.every(id => formData.permissionIds.includes(id));
    
    setFormData(prev => ({
      ...prev,
      permissionIds: allSelected
        ? prev.permissionIds.filter(id => !groupIds.includes(id))
        : [...new Set([...prev.permissionIds, ...groupIds])]
    }));
  };

  // Select all / deselect all globally
  const toggleAllPermissions = () => {
    const allIds = permissions.map(p => p.id);
    const allSelected = allIds.every(id => formData.permissionIds.includes(id));
    
    setFormData(prev => ({
      ...prev,
      permissionIds: allSelected ? [] : [...allIds]
    }));
  };

  // Copy permissions from an existing role
  const copyFromRole = (roleId) => {
    if (!roleId) return;
    const srcRole = roles.find(r => r.id === parseInt(roleId));
    if (!srcRole) return;
    const copiedIds = srcRole.permissions?.map(p => p.permissionId) || [];
    setFormData(prev => ({ ...prev, permissionIds: [...copiedIds] }));
  };

  const allPermissionIds = permissions.map(p => p.id);
  const allSelected = allPermissionIds.length > 0 && allPermissionIds.every(id => formData.permissionIds.includes(id));



  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1>🔑 إدارة الأدوار والصلاحيات</h1>
        <button
          onClick={() => {
            setShowModal(true);
            setEditingRole(null);
            setFormData({ name: '', description: '', permissionIds: [] });
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
          + إضافة دور جديد
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {roles.map(role => (
          <div key={role.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1e293b' }}>{role.name}</h3>
                <p style={{ margin: '5px 0', fontSize: '13px', color: '#64748b' }}>{role.description}</p>
              </div>
              <div style={{ backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
                {role._count?.users || 0} مستخدم
              </div>
            </div>
            
            <div style={{ flex: 1, marginBottom: '15px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>الصلاحيات:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {role.permissions?.slice(0, 5).map(rp => (
                  <span key={rp.permission.id} style={{ 
                    backgroundColor: '#e0f2fe', 
                    color: '#0369a1', 
                    fontSize: '11px', 
                    padding: '2px 8px', 
                    borderRadius: '4px' 
                  }}>
                    {rp.permission.name}
                  </span>
                ))}
                {(role.permissions?.length || 0) > 5 && (
                  <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>
                    + {role.permissions.length - 5} أخرى
                  </span>
                )}
                {(!role.permissions || role.permissions.length === 0) && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>لا توجد صلاحيات</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button
                onClick={() => handleEdit(role)}
                style={{
                  flex: 1,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                تعديل
              </button>
              <button
                onClick={() => handleDelete(role.id)}
                disabled={role.name === 'ADMIN'}
                style={{
                  flex: 1,
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  color: '#ef4444',
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: role.name === 'ADMIN' ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  opacity: role.name === 'ADMIN' ? 0.5 : 1
                }}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
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
              width: '800px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '20px' }}>
              {editingRole ? 'تعديل دور' : 'إضافة دور جديد'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>اسم الدور *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={editingRole?.name === 'ADMIN'}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>الوصف</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '16px', margin: 0 }}>
                    تحديد الصلاحيات
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'normal', marginRight: '8px' }}>
                      ({formData.permissionIds.length} / {permissions.length})
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {/* Copy from existing role */}
                    <select
                      onChange={(e) => { copyFromRole(e.target.value); e.target.value = ''; }}
                      defaultValue=""
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '12px',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" disabled>📋 نسخ من دور...</option>
                      {roles.filter(r => !editingRole || r.id !== editingRole.id).map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.permissions?.length || 0} صلاحية)</option>
                      ))}
                    </select>

                    {/* Toggle all */}
                    <button
                      type="button"
                      onClick={toggleAllPermissions}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: allSelected ? '#fee2e2' : '#dcfce7',
                        color: allSelected ? '#991b1b' : '#166534',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {allSelected ? '❌ إلغاء الكل' : '✅ تحديد الكل'}
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '25px' }}>
                  {Object.entries(groupedPermissions).map(([group, perms]) => {
                    const colors = GROUP_COLORS[group] || { bg: '#f9fafb', color: '#374151', border: '#d1d5db' };
                    const groupIds = perms.map(p => p.id);
                    const allGroupSelected = groupIds.every(id => formData.permissionIds.includes(id));
                    const someGroupSelected = groupIds.some(id => formData.permissionIds.includes(id));

                    return (
                      <div key={group}>
                        <div 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            fontWeight: 'bold', 
                            color: colors.color, 
                            marginBottom: '10px', 
                            fontSize: '13px', 
                            backgroundColor: colors.bg, 
                            padding: '6px 10px', 
                            borderRadius: '6px',
                            borderRight: `3px solid ${colors.border}`,
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                          onClick={() => toggleGroup(perms)}
                        >
                          <span>{groupLabels[group] || group}</span>
                          <input
                            type="checkbox"
                            checked={allGroupSelected}
                            ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected; }}
                            onChange={() => toggleGroup(perms)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: colors.color }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {perms.map(p => (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                              <input
                                type="checkbox"
                                checked={formData.permissionIds.includes(p.id)}
                                onChange={() => togglePermission(p.id)}
                                style={{ width: '16px', height: '16px', accentColor: colors.color }}
                              />
                              {p.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#2563eb',
                    color: 'white',
                    padding: '12px 30px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  حفظ الدور
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    padding: '12px 30px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
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

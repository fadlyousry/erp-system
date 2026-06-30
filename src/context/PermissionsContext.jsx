import React, { createContext, useContext, useState, useEffect } from 'react';

const PermissionsContext = createContext();

export const PermissionsProvider = ({ children, user }) => {
    const [permissions, setPermissions] = useState([]);

    useEffect(() => {
        if (user && user.permissions) {
            setPermissions(user.permissions);
        } else {
            setPermissions([]);
        }
    }, [user]);

    const hasPermission = (permissionKey) => {
        if (!user) return false;
        // ADMIN always has all permissions. Robust check for casing and ID 1 fallback.
        const roleName = String(user.role?.name || user.role || '').toUpperCase();
        if (roleName === 'ADMIN' || user.id === 1 || user.id === '1') return true;

        
        return permissions.includes(permissionKey);
    };

    const hasAnyPermission = (permissionKeys) => {
        if (!Array.isArray(permissionKeys)) return hasPermission(permissionKeys);
        return permissionKeys.some(key => hasPermission(key));
    };

    const hasAllPermissions = (permissionKeys) => {
        if (!Array.isArray(permissionKeys)) return hasPermission(permissionKeys);
        return permissionKeys.every(key => hasPermission(key));
    };

    return (
        <PermissionsContext.Provider value={{ permissions, hasPermission, hasAnyPermission, hasAllPermissions }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissions = () => {
    const context = useContext(PermissionsContext);
    if (!context) {
        throw new Error('usePermissions must be used within a PermissionsProvider');
    }
    return context;
};

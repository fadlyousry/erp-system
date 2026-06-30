/**
 * Date Utility Functions
 */

/**
 * Returns a local date string in YYYY-MM-DD format.
 * This avoids the 2AM rollover issue caused by toISOString() (which is UTC).
 * 
 * @param {Date|string|number} date 
 * @returns {string} YYYY-MM-DD
 */
export const getLocalDateString = (date = new Date()) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
};

/**
 * Safely formats a date for HTML date inputs (YYYY-MM-DD).
 * 
 * @param {any} d 
 * @returns {string}
 */
export const formatDateForInput = (d) => {
    if (!d) return "";
    return getLocalDateString(d);
};

// Sections a STAFF user can be granted access to. `key` matches the route path
// and the sidebar nav `to` (minus the leading slash; '' = dashboard at '/').
// Admins always have access to everything regardless of this list.
export const SECTIONS = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'products',     label: 'Products' },
  { key: 'pos',          label: 'POS' },
  { key: 'purchases',    label: 'Purchases' },
  { key: 'suppliers',    label: 'Suppliers' },
  { key: 'aged-products',label: 'Aged Products' },
  { key: 'inventory',    label: 'Inventory' },
  { key: 'sales',        label: 'Sales' },
  { key: 'reports',      label: 'Reports' },
  { key: 'web-orders',   label: 'Web Orders' },
  { key: 'customers',    label: 'Customers' },
  { key: 'coupons',      label: 'Coupons' },
];

// Whether a user can access a section. Admins: always. Staff: per their permissions.
export function canAccess(user, sectionKey) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const sections = user.permissions?.sections || [];
  return sections.includes(sectionKey);
}

// Whether a user may see sensitive cost-price / profit figures.
export function canViewCostPrice(user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return !!user.permissions?.viewCostPrice;
}

// Whether a user may edit or delete records (products, purchases, sales).
// Admins: always. Staff: only if explicitly granted in their permissions.
export function canManage(user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return !!user.permissions?.canManage;
}

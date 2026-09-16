import { create } from 'zustand';
import api from '../utils/api';
import shopConfig from '../config/shop.config';

// Storefront-facing shop details (contact/social/branding) fetched from the
// admin's Business & GST settings (GET /settings/business-public) instead of
// being hard-coded in shop.config.js. Falls back to shopConfig's static
// values field-by-field for anything the admin hasn't filled in yet, so the
// site never shows a blank phone/address/etc. before an admin sets one.
const useBusinessStore = create((set, get) => ({
  loaded: false,
  business: null,

  fetchBusiness: async () => {
    if (get().loaded) return;
    try {
      const { data } = await api.get('/settings/business-public');
      set({ business: data.config, loaded: true });
    } catch {
      set({ loaded: true }); // fall back to shopConfig entirely
    }
  },
}));

export default useBusinessStore;

const FALLBACK = {
  businessName: shopConfig.brand.name,
  addressLine: shopConfig.contact.address,
  phone: shopConfig.contact.phone,
  email: shopConfig.contact.email,
  tagline: shopConfig.brand.tagline,
  description: shopConfig.brand.description,
  whatsapp: shopConfig.contact.whatsapp,
  businessHours: shopConfig.contact.businessHours,
  mapUrl: shopConfig.contact.mapUrl,
  logoUrl: shopConfig.brand.logoUrl,
  facebook: shopConfig.social.facebook,
  instagram: shopConfig.social.instagram,
  twitter: shopConfig.social.twitter,
  youtube: shopConfig.social.youtube,
  tiktok: shopConfig.social.tiktok,
};

// Hook version of the merged contact/brand/social shape the old shopConfig.*
// call sites used — subscribes to the store so components re-render once
// fetchBusiness() (called once in Layout) resolves, instead of reading a
// stale snapshot. Backend value wins when non-empty, else the static
// shopConfig fallback.
export function useBusiness() {
  const b = useBusinessStore((s) => s.business) || {};
  const merged = {};
  for (const key of Object.keys(FALLBACK)) {
    merged[key] = b[key] != null && b[key] !== '' ? b[key] : FALLBACK[key];
  }
  return merged;
}

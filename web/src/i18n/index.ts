import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { safeStorage, STORAGE_KEYS } from '@/lib/safeStorage';
import vi from './vi.json';
import en from './en.json';

export type Lang = 'vi' | 'en';

const initial: Lang = safeStorage.get(STORAGE_KEYS.lang) === 'en' ? 'en' : 'vi';

// Bundled (not fetched) so the demo works offline.
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

document.documentElement.setAttribute('lang', initial);
i18n.on('languageChanged', (lng) => {
  safeStorage.set(STORAGE_KEYS.lang, lng);
  document.documentElement.setAttribute('lang', lng);
});

export const lang = (): Lang => (i18n.language === 'en' ? 'en' : 'vi');

export default i18n;

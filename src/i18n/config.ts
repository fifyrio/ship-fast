export const locales = ['en', 'zh', 'de', 'fr'] as const;
export const defaultLocale = 'en' as const;
export type Locale = (typeof locales)[number];
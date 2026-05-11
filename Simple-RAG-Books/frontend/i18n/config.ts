export const locales = ["uz", "en", "ru"] as const;
export const defaultLocale = "uz";

export const localeNames: Record<string, string> = {
  uz: "O'zbek",
  en: "English",
  ru: "Русский",
};

export const localeFlags: Record<string, string> = {
  uz: "🇺🇿",
  en: "🇬🇧",
  ru: "🇷🇺",
};
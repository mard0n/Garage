"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import uz from "../messages/uz.json";
import en from "../messages/en.json";
import ru from "../messages/ru.json";

const resources = {
  uz: { translation: uz },
  en: { translation: en },
  ru: { translation: ru },
};

const getInitialLocale = () => {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp("(^| )locale=([^;]+)"));
    return match ? match[2] : "uz";
  }
  return "uz";
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: "uz",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
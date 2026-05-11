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

i18n.use(initReactI18next).init({
  resources,
  lng: "uz",
  fallbackLng: "uz",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
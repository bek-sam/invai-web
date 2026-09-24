import { initI18n } from "@invai/ui";
import i18n from "i18next";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "es";
const KEY = "invai.lang";

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "es") return v;
  } catch {}
  return navigator.language?.startsWith("es") ? "es" : "en";
}

/** Initializes the shared @invai/ui i18n singleton, then layers the web app's strings on top. */
export async function initAppI18n() {
  await initI18n(storedLang());
  i18n.addResourceBundle("en", "translation", en, true, true);
  i18n.addResourceBundle("es", "translation", es, true, true);
  document.documentElement.lang = i18n.language;
}

export async function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

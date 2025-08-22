import { baseLanguages, alternativeNames } from "../constants/languages.js";

export default class LanguageUtils {
  /**
   * Retrieves language information based on its key
   * @param {string} key - The language key
   * @returns {object|null} - Language information or null if not found
   */
  static getLanguageInfo(key) {
    if (!key) {
      return null;
    }

    const normalizedKey = key.toLowerCase();
    const mappedKey = alternativeNames[normalizedKey] || normalizedKey;
    return baseLanguages[mappedKey] || null;
  }
}

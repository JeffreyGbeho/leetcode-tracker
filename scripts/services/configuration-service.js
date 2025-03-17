export default class ConfigurationService {
  constructor() {}

  /**
   * Retrieves configuration from Chrome local storage
   * @param {Array<string>} properties - The configuration properties to retrieve
   * @returns {Promise<Object>} Object containing configuration values
   */
  async getChromeStorageConfig(properties) {
    return new Promise((resolve) => {
      chrome.storage.local.get(properties, resolve);
    });
  }

  /**
   * Retrieves data configuration from the background script
   * @returns {Promise<Object>} Data configuration object
   */
  async getDataConfig() {
    return chrome.runtime.sendMessage({ type: "getDataConfig" });
  }

  /**
   * Validates that all required configuration fields are present
   * @param {Object} config - The configuration object to validate
   * @param {Array<string>} [requiredFields] - List of field names that must be present and non-empty
   * @returns {boolean} True if all required fields are present and non-empty
   */
  isConfigValid(
    config,
    requiredFields = [
      "leetcode_tracker_repo",
      "leetcode_tracker_username",
      "leetcode_tracker_token",
    ]
  ) {
    if (!config) return false;

    return requiredFields.every((field) => {
      // Check if the property exists and has a truthy value
      return (
        config[field] !== undefined &&
        config[field] !== null &&
        config[field] !== ""
      );
    });
  }
}

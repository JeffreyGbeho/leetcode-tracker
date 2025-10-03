export default class ConfigurationService {
  constructor() {}

  /**
   * Retrieves configuration from Chrome local storage
   * @param {Array<string>} properties - The configuration properties to retrieve
   * @returns {Promise<Object>} Object containing configuration values
   */
  async getChromeStorageConfig(properties) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(properties, resolve);
      } else {
        chrome.runtime.sendMessage(
          { type: "getStorageConfig", properties },
          (response) => {
            resolve(response || {});
          }
        );
      }
    });
  }

  /**
   * Retrieves data configuration from the background script
   * @returns {Promise<Object>} Data configuration object
   */
  async getDataConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get("leetcode_tracker_data_config", (result) => {
          resolve(result.leetcode_tracker_data_config);
        });
      } else {
        chrome.runtime.sendMessage(
          { type: "getDataConfig" },
          (response) => {
            resolve(response || {});
          }
        );
      }
    });
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

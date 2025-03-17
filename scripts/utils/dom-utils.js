export default class DOMUtils {
  /**
   * Waits for an element matching the selector to appear in the DOM
   * @param {string} selector - CSS selector of the element to wait for
   * @returns {Promise<Element>} - A promise that resolves with the found element
   */
  static async waitForElement(selector) {
    const existingElement = document.querySelector(selector);
    if (existingElement) {
      return existingElement;
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }
}

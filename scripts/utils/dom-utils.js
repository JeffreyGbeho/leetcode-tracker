export default class DOMUtils {
  static activeObservers = new Map();

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

    if (this.activeObservers.has(selector)) {
      this.activeObservers.get(selector).disconnect();
      this.activeObservers.delete(selector);
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        this.activeObservers.set(selector, observer);
        if (element) {
          observer.disconnect();
          this.activeObservers.delete(selector);
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

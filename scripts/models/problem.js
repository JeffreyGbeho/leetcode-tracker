import LanguageUtils from "../utils/language-utils.js";

export default class Problem {
  constructor() {
    this.slug = "";
    this.difficulty = "";
    this.description = "";
    this.problemUrl = "";
    this.code = "";
    this.language = {};
    this.loadToken = 0;
  }

  /**
   * Reload problem metadata for the current LeetCode page.
   * Resets slug/difficulty/description first so a submission that races ahead
   * of extraction never reuses the previous problem's stale metadata, then
   * returns a Promise that resolves once extraction completes (or times out).
   */
  loadProblemFromDOM() {
    this.slug = "";
    this.difficulty = "";
    this.description = "";

    const url = this.getDescriptionUrl();

    if (!url) {
      return Promise.resolve();
    }

    return this.extractProblemInfos(url);
  }

  getDescriptionUrl() {
    const url = window.location.href;

    if (url.includes("leetcode.com/problems/")) {
      const problemName = url
        .replace("https://leetcode.com/problems/", "")
        .split("/")[0];

      this.problemUrl = `/problems/${problemName}/`;
      return `https://leetcode.com/problems/${problemName}/description/`;
    }

    return "";
  }

  extractLanguageFromDOM() {
    const language =
      JSON.parse(window.localStorage.getItem("global_lang")) ||
      document.querySelector("#headlessui-popover-button-\\:r1s\\: button")
        ?.textContent;

    this.language = LanguageUtils.getLanguageInfo(language);
  }

  extractCodeFromDOM() {
    const codeElements = document.querySelectorAll(
      `code.language-${this.language.langName}`
    );

    this.code = codeElements[codeElements.length - 1].textContent;
  }

  extractProblemInfos(url) {
    const token = ++this.loadToken;

    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");

      // Invisible iframe
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";

      iframe.src = url;

      const cleanup = (observer) => {
        observer.disconnect();
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        resolve();
      };

      // Observer to retrieve data from the iframe
      iframe.onload = () => {
        const iframeDocument =
          iframe.contentDocument || iframe.contentWindow.document;

        const observer = new MutationObserver((mutations, obs) => {
          if (token !== this.loadToken) {
            cleanup(obs);
            return;
          }

          // Extract data from the iframe
          this.extractDifficultyFromDOM(iframeDocument);
          this.extractDescriptionFromDOM(iframeDocument);
          this.extractSlugFromDOM(iframeDocument);

          // If all data is extracted, stop the observer
          if (this.difficulty && this.description && this.slug) {
            cleanup(obs);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Stop the observer after 3 seconds and remove the iframe
        setTimeout(() => cleanup(observer), 3000);
      };

      document.body.appendChild(iframe);
    });
  }

  async extractSlugFromDOM(iframeContent) {
    const problemNameSelector = iframeContent.querySelector(
      `a[href='${this.problemUrl}']`
    );

    if (problemNameSelector) {
      this.slug = this.formatProblemName(problemNameSelector.textContent);
    }
  }

  async extractDifficultyFromDOM(iframeDocument) {
    const easy = iframeDocument.querySelector("div.text-difficulty-easy");
    const medium = iframeDocument.querySelector("div.text-difficulty-medium");
    const hard = iframeDocument.querySelector("div.text-difficulty-hard");

    if (easy) {
      this.difficulty = "easy";
    } else if (medium) {
      this.difficulty = "medium";
    } else if (hard) {
      this.difficulty = "hard";
    } else {
      this.difficulty = "";
    }
  }

  async extractDescriptionFromDOM(iframeDocument) {
    const problemDescription = iframeDocument.querySelector(
      'div[data-track-load="description_content"]'
    );
    if (problemDescription) {
      this.description = problemDescription.textContent;
    }
  }

  formatProblemName(problemName) {
    if (!problemName) {
      return "";
    }

    let formatted = problemName.toString().trim();

    formatted = formatted.replace(/\./g, "-").replace(/\s+/g, "");

    formatted = formatted.replace(/^[\/\-_]+|[\/\-_]+$/g, '');

    formatted = formatted.replace(/\//g, '-');

    return formatted;
  }
}

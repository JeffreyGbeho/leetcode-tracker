export default class Problem {
  constructor() {
    this.slug = "";
    this.difficulty = "";
    this.description = "";
    this.problemUrl = "";
  }

  loadProblemFromDOM() {
    const url = this.getDescriptionUrl();

    if (url) {
      this.extractProblemInfos(url);
    }
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

  extractProblemInfos(url) {
    const iframe = document.createElement("iframe");

    // Invisible iframe
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    iframe.src = url;

    // Observer to retrieve data from the iframe
    iframe.onload = () => {
      const iframeDocument =
        iframe.contentDocument || iframe.contentWindow.document;

      const observer = new MutationObserver((mutations, obs) => {
        // Extract data from the iframe
        this.extractDifficultyFromDOM(iframeDocument);
        this.extractDescriptionFromDOM(iframeDocument);
        this.extractSlugFromDOM(iframeDocument);

        // If all data is extracted, stop the observer
        if (this.difficulty && this.description && this.slug) {
          obs.disconnect();
          document.body.removeChild(iframe);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Stop the observer after 3 seconds and remove the iframe
      setTimeout(() => {
        observer.disconnect();
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    };

    document.body.appendChild(iframe);
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
    return problemName.replace(".", "-").split(" ").join("");
  }
}

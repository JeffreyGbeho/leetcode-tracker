import DOMUtils from "/scripts/utils/dom-utils.js";

export default class Problem {
  constructor() {
    this.name = "";
    this.slug = "";
    this.difficulty = "";
    this.description = "";
  }

  loadProblemFromDOM() {
    this.extractSlugFromDOM();
    this.extractDifficultyFromDOM();
    this.extractDescriptionFromDOM();
  }

  async extractSlugFromDOM() {
    const hrefSelector = window.location.pathname.replace("description/", "");

    const problemNameSelector = await DOMUtils.waitForElement(
      `a[href='${hrefSelector}']`
    );

    if (problemNameSelector) {
      this.slug = this.formatProblemName(problemNameSelector.textContent);
    }
  }

  extractDifficultyFromDOM() {
    const easy = document.querySelector("div.text-difficulty-easy");
    const medium = document.querySelector("div.text-difficulty-medium");
    const hard = document.querySelector("div.text-difficulty-hard");

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

  async extractDescriptionFromDOM() {
    const problemDescription = await DOMUtils.waitForElement(
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

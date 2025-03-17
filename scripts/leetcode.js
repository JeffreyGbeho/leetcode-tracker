import Problem from "/scripts/models/problem.js";
import RouteService from "/scripts/services/route-service.js";
import DOMUtils from "/scripts/utils/dom-utils.js";
import GithubService from "/scripts/services/github-service.js";
import { domElements } from "/scripts/constants/dom-elements.js";

export default class LeetcodeTracker {
  constructor() {
    this.problem = new Problem();
    this.route = new RouteService(() => this.init());
    this.init();
  }

  async init() {
    await DOMUtils.waitForElement(
      `${domElements.submitButton}:not([data-state="closed"])`
    );
    this.problem.loadProblemFromDOM();
    this.setupSubmitButton();
  }

  setupSubmitButton() {
    const submitButton = document.querySelector(domElements.submitButton);
    submitButton.addEventListener("click", () => {
      const existingResult = document.querySelector(
        domElements.submissionResult
      );
      if (existingResult) {
        existingResult.remove();
      }

      this.handleSubmission();
    });
  }

  async handleSubmission() {
    await DOMUtils.waitForElement(domElements.submissionResult);
    const accepted = document.querySelector(domElements.submissionResult);
    if (accepted && accepted.textContent === "Accepted") {
      const githubService = new GithubService(this.problem);
      githubService.submitToGitHub();
    }
  }
}

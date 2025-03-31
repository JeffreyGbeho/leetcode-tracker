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
    this.problem.loadProblemFromDOM();
    await DOMUtils.waitForElement(
      `${domElements.submitButton}:not([data-state="closed"])`
    );
    this.setupSubmitButton();
  }

  setupSubmitButton() {
    const submitButton = document.querySelector(domElements.submitButton);

    if (this.clickHandlerAttached) {
      submitButton.removeEventListener("click", this.submitClickHandler);
      this.clickHandlerAttached = false;
    }

    this.submitClickHandler = () => {
      const existingResult = document.querySelector(
        domElements.submissionResult
      );
      if (existingResult) {
        existingResult.remove();
      }

      this.handleSubmission();
    };

    submitButton.addEventListener("click", this.submitClickHandler);
    this.clickHandlerAttached = true;
  }

  async handleSubmission() {
    await DOMUtils.waitForElement(domElements.submissionResult);
    const accepted = document.querySelector(domElements.submissionResult);
    if (accepted && accepted.textContent === "Accepted") {
      const result = await chrome.storage.local.get(
        "leetcode_tracker_comment_submission"
      );
      const isCommentEnabled =
        result.leetcode_tracker_comment_submission || false;

      const userComment = isCommentEnabled ? await this.showCommentPopup() : "";
      const githubService = new GithubService(this.problem);
      githubService.submitToGitHub(userComment);
    }
  }

  showCommentPopup() {
    return new Promise((resolve) => {
      // Créer l'élément de la popup
      const popup = document.createElement("div");
      popup.className = "leetcode-tracker-comment-popup";
      popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
      `;

      // Contenu de la popup
      const popupContent = document.createElement("div");
      popupContent.style.cssText = `
        background-color: white;
        padding: 24px;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      `;

      // En-tête avec logo/titre
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 16px;
      `;

      const title = document.createElement("h3");
      title.innerHTML = "Leetcode<span style='color: #FFA116;'>Tracker</span>";
      title.style.cssText = `
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: #262626;
      `;

      header.appendChild(title);

      // Instruction
      const instruction = document.createElement("p");
      instruction.textContent =
        "Add notes about your solution approach, time complexity, etc.";
      instruction.style.cssText = `
        color: #525252;
        font-size: 14px;
        margin-bottom: 16px;
        line-height: 1.5;
      `;

      // Zone de texte pour le commentaire
      const textarea = document.createElement("textarea");
      textarea.style.cssText = `
        width: 100%;
        height: 150px;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #E0E0E0;
        border-radius: 8px;
        font-family: inherit;
        font-size: 14px;
        margin-bottom: 20px;
        resize: vertical;
        background-color: #F5F5F5;
      `;
      textarea.placeholder =
        "Example: This solution uses a stack to keep track of...";

      // Séparateur
      const separator = document.createElement("div");
      separator.style.cssText = `
        height: 1px;
        background-color: #E0E0E0;
        margin: 16px 0;
      `;

      // Conteneur pour les boutons
      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
      `;

      // Bouton Skip
      const skipButton = document.createElement("button");
      skipButton.textContent = "Skip";
      skipButton.style.cssText = `
        padding: 8px 16px;
        background-color: white;
        color: #525252;
        border: 1px solid #E0E0E0;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
      `;

      // Hover effect
      skipButton.onmouseover = () => {
        skipButton.style.backgroundColor = "#F5F5F5";
      };
      skipButton.onmouseout = () => {
        skipButton.style.backgroundColor = "white";
      };

      // Bouton Save
      const saveButton = document.createElement("button");
      saveButton.textContent = "Save Comment";
      saveButton.style.cssText = `
        padding: 8px 16px;
        background-color: #FFA116;
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: opacity 0.2s;
      `;

      // Hover effect
      saveButton.onmouseover = () => {
        saveButton.style.opacity = "0.9";
      };
      saveButton.onmouseout = () => {
        saveButton.style.opacity = "1";
      };

      // Ajouter les éléments au DOM
      buttonContainer.appendChild(skipButton);
      buttonContainer.appendChild(saveButton);

      popupContent.appendChild(header);
      popupContent.appendChild(instruction);
      popupContent.appendChild(textarea);
      popupContent.appendChild(separator);
      popupContent.appendChild(buttonContainer);

      popup.appendChild(popupContent);
      document.body.appendChild(popup);

      // Focus sur la zone de texte
      setTimeout(() => textarea.focus(), 100);

      // Gestion des événements
      skipButton.addEventListener("click", () => {
        document.body.removeChild(popup);
        resolve(""); // Résoudre avec une chaîne vide si l'utilisateur saute
      });

      saveButton.addEventListener("click", () => {
        const comment = textarea.value.trim();
        document.body.removeChild(popup);
        resolve(comment); // Résoudre avec le commentaire
      });

      // Fermer la popup en cliquant en dehors
      popup.addEventListener("click", (e) => {
        if (e.target === popup) {
          document.body.removeChild(popup);
          resolve("");
        }
      });
    });
  }
}

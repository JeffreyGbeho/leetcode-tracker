import Problem from "/scripts/models/problem.js";
import RouteService from "/scripts/services/route-service.js";
import DOMUtils from "/scripts/utils/dom-utils.js";
import GithubService from "/scripts/services/github-service.js";
import { domElements } from "/scripts/constants/dom-elements.js";

/**
 * Main controller class for the LeetCode Tracker extension.
 * Orchestrates the interaction between LeetCode's interface and GitHub synchronization.
 */
export default class LeetcodeTracker {
  /**
   * Initialize the LeetCode Tracker with required services and route monitoring.
   * Sets up problem model, GitHub service, and route change detection.
   */
  constructor() {
    this.problem = new Problem();
    this.githubService = new GithubService();
    this.route = new RouteService(() => this.init());
    this.init();
  }

  /**
   * Initialize or reinitialize the tracker for the current problem page.
   * Loads problem data from DOM and sets up submission monitoring.
   *
   * Algorithm:
   * 1. Extract problem metadata from current page DOM
   * 2. Wait for submit button to be available and interactive
   * 3. Attach click handler to monitor submission attempts
   */
  async init() {
    this.problem.loadProblemFromDOM();
    await DOMUtils.waitForElement(
      `${domElements.submitButton}:not([data-state="closed"])`
    );
    this.setupSubmitButton();
  }

  /**
   * Set up event listener on the LeetCode submit button to monitor submissions.
   * Ensures clean handler attachment by removing any existing listeners first.
   *
   * Algorithm:
   * 1. Remove any previously attached click handlers to prevent duplicates
   * 2. Create new click handler that clears old results and triggers submission handling
   * 3. Attach the handler to the submit button element
   * 4. Track handler attachment state to prevent memory leaks
   */
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

  /**
   * Handle the submission process after user clicks submit button.
   * Waits for submission result and processes accepted solutions.
   *
   * Algorithm:
   * 1. Wait for submission result element to appear in DOM
   * 2. Check if submission was accepted (status === "Accepted")
   * 3. Check user settings for comment functionality
   * 4. Show comment popup if enabled, collect user input
   * 5. Extract language and code information from current DOM state
   * 6. Submit complete solution data to GitHub via GithubService
   */
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
      this.problem.extractLanguageFromDOM();
      this.problem.extractCodeFromDOM();
      this.githubService.submitToGitHub(this.problem, userComment);
    }
  }

  /**
   * Display a modal popup for users to add comments about their solution.
   * Provides a rich UI experience with proper styling and interaction handling.
   *
   * Algorithm:
   * 1. Create modal overlay with dark background
   * 2. Build popup content with header, instruction text, and textarea
   * 3. Style components with inline CSS for consistency across sites
   * 4. Add interactive buttons (Skip/Save) with hover effects
   * 5. Handle user interactions: save comment, skip, or click outside to close
   * 6. Clean up DOM elements and resolve promise with user input
   *
   * UI Components:
   * - Modal overlay with semi-transparent background
   * - Centered popup with professional styling
   * - Branded header with LeetcodeTracker name
   * - Instructional text explaining the purpose
   * - Large textarea for multi-line comments
   * - Action buttons with hover states and proper spacing
   *
   * @returns {Promise<string>} User's comment text or empty string if skipped
   */
  showCommentPopup() {
    return new Promise((resolve) => {
      // Create modal overlay element
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

      // Create main popup content container
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

      // Create header section with branding
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

      // Create instruction text
      const instruction = document.createElement("p");
      instruction.textContent =
        "Add notes about your solution approach, time complexity, etc.";
      instruction.style.cssText = `
        color: #525252;
        font-size: 14px;
        margin-bottom: 16px;
        line-height: 1.5;
      `;

      // Create comment input textarea
      const textarea = document.createElement("textarea");
      textarea.style.cssText = `
        width: 100%;
        height: 150px;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #E0E0E0;
        border-radius: 8px;
        color: rgb(0, 0, 0);
        font-family: inherit;
        font-size: 14px;
        margin-bottom: 20px;
        resize: vertical;
        background-color: #F5F5F5;
      `;
      textarea.placeholder =
        "Example: This solution uses a stack to keep track of...";

      // Create visual separator
      const separator = document.createElement("div");
      separator.style.cssText = `
        height: 1px;
        background-color: #E0E0E0;
        margin: 16px 0;
      `;

      // Create button container
      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
      `;

      // Create Skip button
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

      // Add hover effects for Skip button
      skipButton.onmouseover = () => {
        skipButton.style.backgroundColor = "#F5F5F5";
      };
      skipButton.onmouseout = () => {
        skipButton.style.backgroundColor = "white";
      };

      // Create Save button
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

      // Add hover effects for Save button
      saveButton.onmouseover = () => {
        saveButton.style.opacity = "0.9";
      };
      saveButton.onmouseout = () => {
        saveButton.style.opacity = "1";
      };

      // Assemble DOM structure
      buttonContainer.appendChild(skipButton);
      buttonContainer.appendChild(saveButton);

      popupContent.appendChild(header);
      popupContent.appendChild(instruction);
      popupContent.appendChild(textarea);
      popupContent.appendChild(separator);
      popupContent.appendChild(buttonContainer);

      popup.appendChild(popupContent);
      document.body.appendChild(popup);

      // Focus on textarea for immediate typing
      setTimeout(() => textarea.focus(), 100);

      // Handle Skip button click
      skipButton.addEventListener("click", () => {
        document.body.removeChild(popup);
        resolve(""); // Resolve with empty string if user skips
      });

      // Handle Save button click
      saveButton.addEventListener("click", () => {
        const comment = textarea.value.trim();
        document.body.removeChild(popup);
        resolve(comment); // Resolve with user's comment
      });

      // Handle click outside popup to close
      popup.addEventListener("click", (e) => {
        if (e.target === popup) {
          document.body.removeChild(popup);
          resolve("");
        }
      });
    });
  }
}

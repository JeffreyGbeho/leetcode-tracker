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
        let isCommentEnabled = false;
        try {
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            const result = await chrome.storage.local.get(
              "leetcode_tracker_comment_submission"
            );
            isCommentEnabled =
              !!result?.leetcode_tracker_comment_submission;
          }
        } catch (_) {
          // Fallback: leave isCommentEnabled false if storage not accessible
        }

        const userComment = isCommentEnabled ? await this.showCommentPopup() : "";
        this.problem.extractLanguageFromDOM();
        this.problem.extractCodeFromDOM();
        try {
          await this.githubService.submitToGitHub(this.problem, userComment);
          this.showToast(
            `Problem ${this.problem.slug || ""} synced successfully`,
            "success"
          );
        } catch (error) {
          const message = (error && error.message) ? error.message.split("\n")[0].slice(0, 140) : "Unknown error";
          this.showToast(
            `Problem ${this.problem.slug || ""} sync failed: ${message}`,
            "error"
          );
        }
      }
    }

    /**
     * Display a transient toast notification on the LeetCode page.
     * Creates container & styles once, then appends individual toasts.
     *
     * @param {string} message - Text to display.
     * @param {('success'|'error')} type - Visual style variant.
     */
    showToast(message, type = "success") {
      if (!document.getElementById("leetcode-tracker-toast-styles")) {
        const style = document.createElement("style");
        style.id = "leetcode-tracker-toast-styles";
        style.textContent = `
          :root { --ltc-orange: #FFA116; --ltc-success: #00B8A3; --ltc-error: #FF4D4F; }
          #leetcode-tracker-toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 14px; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .lt-toast { min-width: 280px; max-width: 380px; padding: 14px 18px 14px 16px; border-radius: 18px; display: flex; align-items: flex-start; gap: 12px; font-size: 13px; line-height: 1.45; font-weight: 500; opacity: 0; transform: translateY(10px) scale(.97); animation: lt-toast-in .38s cubic-bezier(.4,.14,.3,1) forwards, lt-toast-out .4s ease forwards 5.2s; position: relative; box-shadow: 0 4px 16px -2px rgba(0,0,0,0.25),0 2px 4px rgba(0,0,0,.12); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border: 1px solid var(--lt-border-color); background: var(--lt-bg); color: var(--lt-fg); }
          .lt-theme-light .lt-toast { --lt-bg: #ffffff; --lt-fg: #262626; --lt-border-color: #e2e2e2; }
          .lt-theme-dark .lt-toast { --lt-bg: #2b2b2b; --lt-fg: #f5f5f5; --lt-border-color: #3a3a3a; }
    /* Static accent ring instead of moving bar */
    .lt-toast-success { box-shadow: 0 0 0 3px rgba(0,184,163,0.15),0 4px 16px -2px rgba(0,0,0,0.25),0 2px 4px rgba(0,0,0,.12); }
    .lt-toast-error { box-shadow: 0 0 0 3px rgba(255,77,79,0.18),0 4px 16px -2px rgba(0,0,0,0.25),0 2px 4px rgba(0,0,0,.12); }
          .lt-toast-icon { width:20px; height:20px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; margin-top:1px; }
          .lt-toast-icon svg { width:20px; height:20px; }
          .lt-toast-success .lt-toast-icon svg { stroke: var(--ltc-success); }
          .lt-toast-error .lt-toast-icon svg { stroke: var(--ltc-error); }
          .lt-toast-close { cursor: pointer; margin-left: 4px; background: transparent; border: none; color: var(--lt-fg); opacity: .55; font-size: 16px; line-height: 1; padding: 0 4px; transition: opacity .15s ease; }
          .lt-toast-close:hover { opacity: .95; }
          @keyframes lt-toast-in { to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes lt-toast-out { to { opacity: 0; transform: translateY(4px) scale(.94); } }
        `;
        document.head.appendChild(style);
      }

      let container = document.getElementById("leetcode-tracker-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "leetcode-tracker-toast-container";
        document.body.appendChild(container);
      }

      const toast = document.createElement("div");
      toast.className = `lt-toast lt-toast-${type === "error" ? "error" : "success"}`;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");

      // Apply theme class once to container for color variables
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const rootContainer = document.getElementById('leetcode-tracker-toast-container');
      if (rootContainer && !rootContainer.classList.contains('lt-theme-light') && !rootContainer.classList.contains('lt-theme-dark')) {
        rootContainer.classList.add(prefersDark ? 'lt-theme-dark' : 'lt-theme-light');
      }

      const icon = document.createElement('div');
      icon.className = 'lt-toast-icon';
      icon.innerHTML = type === 'error'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/></svg>`;

      const text = document.createElement("div");
      text.style.flex = "1";
      text.textContent = message;

      const closeBtn = document.createElement("button");
      closeBtn.className = "lt-toast-close";
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", () => {
        toast.style.animation = "lt-toast-out .35s forwards";
        setTimeout(() => toast.remove(), 330);
      });

    toast.appendChild(icon);
    toast.appendChild(text);
      toast.appendChild(closeBtn);
      container.appendChild(toast);


      // Auto-remove after animation finishes (~4.55s)
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.remove();
        }
    }, 5400);
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

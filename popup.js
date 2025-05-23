/**
 * DOM element references for the extension popup interface.
 * Centralizes all DOM queries for better maintainability and performance.
 */
const DOM = {
  authenticate: document.getElementById("authenticate"),
  authenticateButton: document.getElementById("github-authenticate-button"),
  hookRepo: document.getElementById("hook-repo"),
  authenticated: document.getElementById("authenticated"),
  repoName: document.getElementById("repo-name"),
  repoNameError: document.getElementById("repo-name-error"),
  hookButton: document.getElementById("hook-button"),
  unlinkButton: document.getElementById("unlink-button"),
  repositoryName: document.getElementById("repository-name"),
  repositoryLink: document.getElementById("repository-link"),
  githubUsername: document.getElementById("github-username"),
  logoutButton: document.getElementById("logout-button"),
  changeAccountButton: document.getElementById("change-account-button"),
  checkboxCodeSubmitSetting: document.getElementById("submit-code-checkbox"),
  checkboxSyncMultipleSubmissions: document.getElementById(
    "multiple-submission-checkbox"
  ),
  checkboxCommentSubmission: document.getElementById(
    "comment-submission-checkbox"
  ),
  syncButton: document.getElementById("sync-button"),
  syncStatus: document.getElementById("sync-status"),
  syncTime: document.getElementById("sync-time"),
  stats: {
    easy: document.getElementById("easy"),
    medium: document.getElementById("medium"),
    hard: document.getElementById("hard"),
  },
};

/**
 * Main controller class for the browser extension popup interface.
 * Manages authentication flow, repository linking, settings, and synchronization status.
 */
class PopupManager {
  /**
   * Initialize the popup manager with all required components.
   * Sets up statistics display, event listeners, settings synchronization,
   * and starts background sync status monitoring.
   */
  constructor() {
    this.initializeStats();
    this.initializeEventListeners();
    this.initializeSetting();

    this.updateSyncStatus();
    this.syncStatusInterval = setInterval(() => this.updateSyncStatus(), 2000);
  }

  /**
   * Load and synchronize all user settings from Chrome storage to UI controls.
   * Ensures the popup displays current setting states correctly.
   */
  initializeSetting() {
    chrome.storage.local.get("leetcode_tracker_code_submit", (result) => {
      const codeSubmit = result.leetcode_tracker_code_submit;
      DOM.checkboxCodeSubmitSetting.checked = codeSubmit;
    });

    chrome.storage.local.get(
      "leetcode_tracker_sync_multiple_submission",
      (result) => {
        const isSync = result.leetcode_tracker_sync_multiple_submission;
        DOM.checkboxSyncMultipleSubmissions.checked = isSync;
      }
    );

    chrome.storage.local.get(
      "leetcode_tracker_comment_submission",
      (result) => {
        const isCommentEnabled = result.leetcode_tracker_comment_submission;
        DOM.checkboxCommentSubmission.checked = isCommentEnabled;
      }
    );
  }

  /**
   * Toggle the setting for syncing old problems that were solved before extension installation.
   * Provides backward compatibility for existing LeetCode solutions.
   */
  toggleSyncOldProblemsSetting() {
    chrome.storage.local.get("leetcode_tracker_sync_old_problems", (result) => {
      const syncOldProblems =
        result.leetcode_tracker_sync_old_problems !== undefined
          ? result.leetcode_tracker_sync_old_problems
          : false;

      chrome.storage.local.set({
        leetcode_tracker_sync_old_problems: !syncOldProblems,
      });

      this.initializeSetting();
    });
  }

  /**
   * Toggle the code submission setting with dependent setting management.
   * When disabled, automatically disables multiple submissions and comments
   * to maintain logical consistency.
   *
   * Algorithm:
   * 1. Get current code submit setting state
   * 2. Invert the setting value
   * 3. If disabling code submit, also disable dependent features
   * 4. Update storage and refresh UI
   */
  toggleCodeSubmitSetting() {
    chrome.storage.local.get("leetcode_tracker_code_submit", (result) => {
      const codeSubmit = result.leetcode_tracker_code_submit;
      chrome.storage.local.set({
        leetcode_tracker_code_submit: !codeSubmit,
      });

      // Disable dependent settings when code submit is disabled
      if (!codeSubmit) {
        chrome.storage.local.set({
          leetcode_tracker_sync_multiple_submission: false,
          leetcode_tracker_comment_submission: false,
        });
      }

      this.initializeSetting();
    });
  }

  /**
   * Toggle multiple submission synchronization with dependency management.
   * Handles complex interdependencies between settings to prevent invalid states.
   *
   * Settings Dependencies:
   * - When enabling: Disables code submit to prevent conflicts
   * - When disabling: Disables comment submission (requires multiple submissions)
   */
  toggleSyncMultipleSubmissionSetting() {
    chrome.storage.local.get(
      "leetcode_tracker_sync_multiple_submission",
      (result) => {
        const isSync = result.leetcode_tracker_sync_multiple_submission;
        chrome.storage.local.set({
          leetcode_tracker_sync_multiple_submission: !isSync,
        });

        if (!isSync) {
          // Enabling multiple submissions - disable conflicting settings
          chrome.storage.local.set({
            leetcode_tracker_code_submit: false,
          });
        } else {
          // Disabling multiple submissions - disable dependent settings
          chrome.storage.local.set({
            leetcode_tracker_comment_submission: false,
          });
        }

        this.initializeSetting();
      }
    );
  }

  /**
   * Toggle comment submission setting with prerequisite validation.
   * Comments require multiple submission mode, so enabling comments
   * automatically configures the required dependencies.
   */
  toggleCommentSubmissionSetting() {
    chrome.storage.local.get(
      "leetcode_tracker_comment_submission",
      (result) => {
        const isCommentEnabled = result.leetcode_tracker_comment_submission;
        chrome.storage.local.set({
          leetcode_tracker_comment_submission: !isCommentEnabled,
        });

        if (!isCommentEnabled) {
          // Enabling comments requires multiple submissions
          chrome.storage.local.set({
            leetcode_tracker_code_submit: false,
            leetcode_tracker_sync_multiple_submission: true,
          });
        }

        this.initializeSetting();
      }
    );
  }

  /**
   * Set up all event listeners for the popup interface.
   * Includes DOM event handlers and Chrome extension message listeners.
   */
  initializeEventListeners() {
    document.addEventListener("DOMContentLoaded", this.setupLinks.bind(this));
    DOM.authenticateButton.addEventListener(
      "click",
      this.handleAuthentication.bind(this)
    );
    DOM.hookButton.addEventListener("click", this.handleHookRepo.bind(this));
    DOM.unlinkButton.addEventListener("click", this.unlinkRepo.bind(this));
    DOM.logoutButton.addEventListener("click", this.logout.bind(this));
    DOM.changeAccountButton.addEventListener("click", this.logout.bind(this));
    DOM.checkboxCodeSubmitSetting.addEventListener(
      "click",
      this.toggleCodeSubmitSetting.bind(this)
    );
    DOM.checkboxSyncMultipleSubmissions.addEventListener(
      "click",
      this.toggleSyncMultipleSubmissionSetting.bind(this)
    );
    DOM.checkboxCommentSubmission.addEventListener(
      "click",
      this.toggleCommentSubmissionSetting.bind(this)
    );
    DOM.syncButton.addEventListener("click", this.startManualSync.bind(this));

    // Listen for statistics updates from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "statsUpdate") {
        this.updateStatsDisplay(message.data);
      }
    });
  }

  /**
   * Initiate manual synchronization of all solved problems.
   * Updates UI to show progress and sends sync command to background script.
   *
   * Algorithm:
   * 1. Disable sync button to prevent multiple concurrent syncs
   * 2. Replace button content with animated loading indicator
   * 3. Inject CSS animation for loading spinner
   * 4. Send sync message to background script
   * 5. Update sync status display
   */
  startManualSync() {
    DOM.syncButton.disabled = true;
    DOM.syncButton.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="spin" viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg><span style="margin-left: 5px">Syncing...</span>';

    // Inject CSS animation for loading spinner
    const style = document.createElement("style");
    style.textContent = `
  .spin {
    animation: spin 1.5s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
    document.head.appendChild(style);

    chrome.runtime.sendMessage({ type: "syncSolvedProblems" });

    this.updateSyncStatus();
  }

  /**
   * Update the synchronization status display with current progress and results.
   * Monitors background sync process and updates UI accordingly.
   *
   * Algorithm:
   * 1. Fetch sync status data from Chrome storage
   * 2. Update button state based on sync progress
   * 3. Display appropriate status message and styling
   * 4. Show formatted timestamp of last sync operation
   * 5. Handle error cases and edge states gracefully
   */
  async updateSyncStatus() {
    try {
      const result = await chrome.storage.local.get([
        "leetcode_tracker_sync_in_progress",
        "leetcode_tracker_last_sync_status",
        "leetcode_tracker_last_sync_message",
        "leetcode_tracker_last_sync_date",
      ]);

      const inProgress = result.leetcode_tracker_sync_in_progress || false;
      const lastStatus = result.leetcode_tracker_last_sync_status || "";
      const lastMessage = result.leetcode_tracker_last_sync_message || "";
      const lastDate = result.leetcode_tracker_last_sync_date
        ? new Date(result.leetcode_tracker_last_sync_date)
        : null;

      if (inProgress) {
        DOM.syncButton.disabled = true;
        DOM.syncButton.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="spin" viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg><span style="margin-left: 5px">Syncing...</span>';
        DOM.syncStatus.textContent = "Synchronization in progress...";
      } else {
        DOM.syncButton.disabled = false;
        DOM.syncButton.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg><span style="margin-left: 5px">Sync</span>';

        // Update status message based on last sync result
        if (lastStatus === "success") {
          DOM.syncStatus.textContent = "Last sync: Successful";
          DOM.syncStatus.className = "text-success";
        } else if (lastStatus === "failed") {
          DOM.syncStatus.textContent = "Last sync: Failed";
          DOM.syncStatus.className = "text-danger";

          if (lastMessage) {
            DOM.syncStatus.textContent = `Last sync: Failed - ${lastMessage}`;
          }
        } else if (!lastStatus) {
          DOM.syncStatus.textContent = "No synchronization performed yet";
          DOM.syncStatus.className = "text-muted";
        }
      }

      // Display formatted timestamp
      if (lastDate) {
        const formattedDate = this.formatDate(lastDate);
        DOM.syncTime.textContent = `${formattedDate}`;
        DOM.syncTime.className = "text-muted";
      } else {
        DOM.syncTime.textContent = "";
      }
    } catch (error) {
      // Handle errors silently to prevent popup disruption
    }
  }

  /**
   * Format a date object into a human-readable relative time string.
   * Provides intuitive time descriptions (e.g., "2 minutes ago", "Just now").
   *
   * @param {Date} date - The date to format
   * @returns {string} Human-readable relative time string
   */
  formatDate(date) {
    if (!date) return "";

    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) {
      return "Just now";
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    } else if (diffSeconds < 86400) {
      const hours = Math.floor(diffSeconds / 3600);
      return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    } else {
      return date.toLocaleString();
    }
  }

  /**
   * Configure external links to open in new tabs.
   * Prevents navigation away from the popup interface.
   */
  setupLinks() {
    document.querySelectorAll("a.link").forEach((link) => {
      link.onclick = () => chrome.tabs.create({ active: true, url: link.href });
    });
  }

  /**
   * Check the current authentication status and display appropriate UI state.
   * Determines which section of the popup should be visible based on user progress.
   *
   * State Machine:
   * - No token/username → Show authentication section
   * - Has token but no repo → Show repository setup section
   * - Fully configured → Show main authenticated interface
   */
  async checkAuthStatus() {
    const result = await chrome.storage.local.get([
      "leetcode_tracker_token",
      "leetcode_tracker_username",
      "leetcode_tracker_mode",
      "leetcode_tracker_repo",
    ]);

    if (!result.leetcode_tracker_token || !result.leetcode_tracker_username) {
      DOM.authenticate.style.display = "block";
    } else if (!result.leetcode_tracker_repo || !result.leetcode_tracker_mode) {
      DOM.hookRepo.style.display = "block";
    } else {
      DOM.authenticated.style.display = "block";
    }

    this.updateUserInfos();
  }

  /**
   * Log out the user by clearing all stored data and resetting UI state.
   * Provides complete cleanup for account switching or privacy.
   */
  async logout() {
    try {
      await chrome.storage.local.clear();

      DOM.authenticate.style.display = "block";
      DOM.hookRepo.style.display = "none";
      DOM.authenticated.style.display = "none";
    } catch (error) {
      // Handle logout errors gracefully
    }
  }

  /**
   * Update the user information display with current GitHub username and repository.
   * Constructs the repository link for easy access to the GitHub repository.
   */
  async updateUserInfos() {
    const { leetcode_tracker_repo, leetcode_tracker_username } =
      await chrome.storage.local.get([
        "leetcode_tracker_repo",
        "leetcode_tracker_username",
      ]);
    if (leetcode_tracker_repo) {
      DOM.repositoryName.textContent = leetcode_tracker_repo;
    }
    if (leetcode_tracker_username) {
      DOM.githubUsername.textContent = leetcode_tracker_username;
    }
    if (leetcode_tracker_username && leetcode_tracker_repo) {
      DOM.repositoryLink.href = `https://github.com/${leetcode_tracker_username}/${leetcode_tracker_repo}`;
    }
  }

  /**
   * Initialize the statistics display by requesting current data from background script.
   * Shows loading state while fetching and updates display when data arrives.
   */
  async initializeStats() {
    try {
      this.startLoading();

      const initialStats = await this.getInitialStats();
      if (initialStats) {
        this.updateStatsDisplay(initialStats);
      }
    } catch (error) {
      // Handle stats loading errors gracefully
    }
  }

  /**
   * Request initial statistics data from the background script.
   * Uses Chrome messaging API to communicate with background processes.
   *
   * @returns {Promise<Object>} Promise resolving to statistics object
   */
  getInitialStats() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "requestInitialStats" },
        (response) => {
          resolve(response);
        }
      );
    });
  }

  /**
   * Update the statistics display with new data from background script.
   * Handles both initial load and real-time updates during synchronization.
   *
   * @param {Object} stats - Statistics object with easy, medium, hard counts
   */
  updateStatsDisplay(stats) {
    if (!stats) return;

    this.stopLoading();

    Object.keys(DOM.stats).forEach((key) => {
      if (DOM.stats[key]) {
        DOM.stats[key].textContent = stats[key] || 0;
      }
    });
  }

  /**
   * Show loading animation for statistics section.
   * Provides visual feedback during data fetching.
   */
  startLoading() {
    document.getElementById("loading-container").style.display = "flex";
    document.getElementById("stats").classList.add("loading");
  }

  /**
   * Hide loading animation and show statistics content.
   * Called when data loading completes successfully.
   */
  stopLoading() {
    document.getElementById("loading-container").style.display = "none";
    document.getElementById("stats").classList.remove("loading");
  }

  /**
   * Handle GitHub authentication by opening OAuth flow in new tab.
   * Constructs proper OAuth URL with required parameters and scopes.
   */
  async handleAuthentication() {
    try {
      const data = await chrome.runtime.sendMessage({ type: "getDataConfig" });
      const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${
        data.REDIRECT_URL
      }&scope=${data.SCOPES.join(" ")}`;
      chrome.tabs.create({ url, active: true });
    } catch (error) {
      // Handle authentication errors gracefully
    }
  }

  /**
   * Handle repository setup and validation process.
   * Validates user input and attempts to link the specified repository.
   */
  async handleHookRepo() {
    const repositoryName = DOM.repoName.value;
    DOM.repoNameError.textContent = "";

    if (!repositoryName) {
      DOM.repoNameError.textContent = "Please enter a repository name";
      return;
    }

    try {
      const result = await chrome.storage.local.get([
        "leetcode_tracker_token",
        "leetcode_tracker_username",
      ]);

      if (result) {
        await this.linkRepo(result, repositoryName);
      }
    } catch (error) {
      DOM.repoNameError.textContent =
        "An error occurred while linking the repository";
    }
  }

  /**
   * Link and validate a GitHub repository for synchronization.
   * Verifies repository exists and user has appropriate access permissions.
   *
   * Algorithm:
   * 1. Extract authentication data and repository name
   * 2. Get API configuration from background script
   * 3. Make authenticated request to GitHub API to verify repository
   * 4. Handle authentication errors by logging out user
   * 5. Store repository configuration on successful validation
   * 6. Update UI to show authenticated state
   *
   * @param {Object} githubAuthData - Authentication data with token and username
   * @param {string} repositoryName - Name of repository to link
   */
  async linkRepo(githubAuthData, repositoryName) {
    const { leetcode_tracker_token, leetcode_tracker_username } =
      githubAuthData;
    const dataConfig = await chrome.runtime.sendMessage({
      type: "getDataConfig",
    });

    try {
      const response = await fetch(
        `${dataConfig.REPOSITORY_URL}${leetcode_tracker_username}/${repositoryName}`,
        {
          method: "GET",
          headers: {
            ...dataConfig.HEADERS,
            Authorization: `token ${leetcode_tracker_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }

        throw new Error(result.message);
      }

      await chrome.storage.local.set({
        leetcode_tracker_mode: "commit",
        leetcode_tracker_repo: repositoryName,
      });

      DOM.hookRepo.style.display = "none";
      DOM.authenticated.style.display = "block";
    } catch (error) {
      DOM.repoNameError.textContent = error.message;
    }
  }

  /**
   * Unlink the current repository and return to repository setup state.
   * Allows users to change repositories without full logout.
   */
  async unlinkRepo() {
    try {
      await chrome.storage.local.remove([
        "leetcode_tracker_mode",
        "leetcode_tracker_repo",
      ]);
      DOM.authenticated.style.display = "none";
      DOM.hookRepo.style.display = "block";
    } catch (error) {
      // Handle unlink errors gracefully
    }
  }
}

// Initialize the popup manager and check authentication status
const popupManager = new PopupManager();
popupManager.checkAuthStatus();

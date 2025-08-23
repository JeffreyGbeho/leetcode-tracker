import { ENV } from "./environment.js";
import LeetCodeService from "./scripts/services/leetcode-service.js";
import SyncService from "./scripts/services/sync-service.js";

/**
 * Manages LeetCode problem statistics and synchronization state.
 * Centralized state management for difficulty counters and sync progress tracking.
 */
class LeetCodeStateManager {
  /**
   * Initialize the state manager with default values.
   * Sets up difficulty counters and tracking flags.
   */
  constructor() {
    this.state = {
      counter: {
        easy: 0,
        medium: 0,
        hard: 0,
      },
      isCountingComplete: false,
      lastUpdate: null,
      loading: true,
    };
  }

  /**
   * Increment the counter for a specific difficulty level.
   * Used for real-time updates when new problems are solved.
   *
   * @param {string} difficulty - The difficulty level to increment (Easy, Medium, Hard)
   * @returns {boolean} True if increment was successful, false if invalid difficulty
   */
  incrementCounter(difficulty) {
    if (!difficulty) return;
    const normalizedDifficulty = difficulty.toLowerCase();
    if (normalizedDifficulty in this.state.counter) {
      this.state.counter[normalizedDifficulty] += 1;
      this.state.lastUpdate = new Date();
      this.broadcastState();
      return true;
    }
    return false;
  }

  /**
   * Update statistics with a complete set of difficulty data.
   * Used for bulk updates during synchronization or initialization.
   *
   * Algorithm:
   * 1. Reset all counters to zero
   * 2. Process each difficulty value and increment appropriate counter
   * 3. Update completion status and loading state
   * 4. Broadcast the updated state to all listeners
   *
   * @param {Array<string>} difficulties - Array of difficulty strings to count
   */
  updateStats(difficulties) {
    this.state.counter = { easy: 0, medium: 0, hard: 0 };

    difficulties.forEach((difficulty) => {
      if (difficulty) {
        const normalizedDifficulty = difficulty.toLowerCase();
        if (normalizedDifficulty in this.state.counter) {
          this.state.counter[normalizedDifficulty] += 1;
        }
      }
    });

    this.state.lastUpdate = new Date();
    this.state.loading = false;
    this.state.isCountingComplete = true;

    this.broadcastState();
  }

  /**
   * Get the current statistics state.
   * Returns a copy of the current state for external consumption.
   *
   * @returns {Object} Current statistics with counters and metadata
   */
  getStats() {
    return {
      ...this.state.counter,
      isCountingComplete: this.state.isCountingComplete,
      lastUpdate: this.state.lastUpdate,
      loading: this.state.loading,
    };
  }

  /**
   * Reset all counters and state flags to initial values.
   * Used when starting fresh counting or handling errors.
   */
  reset() {
    this.state.counter = { easy: 0, medium: 0, hard: 0 };
    this.state.isCountingComplete = false;
    this.state.lastUpdate = null;
    this.state.loading = true;
  }

  /**
   * Broadcast current state to all connected UI components.
   * Uses Chrome messaging API to update popup and other interfaces.
   * Handles messaging errors gracefully to prevent state corruption.
   */
  broadcastState() {
    chrome.runtime
      .sendMessage({
        type: "statsUpdate",
        data: this.getStats(),
      })
      .catch(() => {
        // Silently handle messaging errors (e.g., when popup is closed)
      });
  }
}

/**
 * Service for interacting with GitHub repositories to fetch problem data.
 * Handles repository communication and data transformation for statistics.
 */
class GitHubService {
  /**
   * Initialize GitHub service with environment configuration.
   *
   * @param {Object} env - Environment configuration with API endpoints
   */
  constructor(env) {
    this.env = env;
  }

  /**
   * Build the base GitHub API URL for the connected repository.
   * Constructs URL from stored user credentials and repository name.
   *
   * @returns {Promise<string>} Complete GitHub API URL for repository contents
   */
  async buildBasicGithubUrl() {
    const result = await chrome.storage.local.get([
      "leetcode_tracker_username",
      "leetcode_tracker_repo",
    ]);
    return `${this.env.REPOSITORY_URL}${result.leetcode_tracker_username}/${result.leetcode_tracker_repo}/contents/`;
  }

  /**
   * Fetch all LeetCode problems from the connected GitHub repository.
   * Filters repository contents to identify valid problem files.
   *
   * Algorithm:
   * 1. Build GitHub API URL for repository contents
   * 2. Fetch repository file list via GitHub API
   * 3. Filter files matching LeetCode naming pattern (e.g., "1-TwoSum")
   * 4. Extract problem IDs and convert to LeetCode format
   * 5. Return structured problem data for statistics calculation
   *
   * @returns {Promise<Array<Object>>} Array of problem objects with IDs
   */
  async getAllLeetCodeProblems() {
    try {
      const url = await this.buildBasicGithubUrl();
      const response = await fetch(url);
      const data = await response.json();

      return data
        .filter((problem) => /^\d+-[A-Z]/.test(problem.name))
        .map((problem) => ({
          originalName: problem.name,
          questionId: this.convertGithubToLeetCodeSlug(problem.name),
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Convert GitHub filename to LeetCode problem ID.
   * Extracts the numeric problem ID from the filename format.
   *
   * @param {string} githubFileName - GitHub file name (e.g., "1-TwoSum.js")
   * @returns {string} LeetCode problem ID (e.g., "1")
   */
  convertGithubToLeetCodeSlug(githubFileName) {
    const [number] = githubFileName.split("-");
    return number;
  }
}

/**
 * Main controller for the LeetCode Tracker background script.
 * Orchestrates all background services and handles Chrome extension messaging.
 */
class LeetCodeTrackerController {
  /**
   * Initialize the controller with all required services and configuration.
   * Sets up state management, GitHub integration, and Chrome storage defaults.
   */
  constructor() {
    this.stateManager = new LeetCodeStateManager();
    this.githubService = new GitHubService(ENV);
    this.leetCodeService = new LeetCodeService();
    this.syncService = new SyncService();

    // Store environment configuration for other components
    chrome.storage.local.set({ leetcode_tracker_data_config: ENV });

    // Initialize sync status tracking
    chrome.storage.local.set({
      leetcode_tracker_last_sync_status: "",
      leetcode_tracker_sync_in_progress: false,
      leetcode_tracker_last_sync_message: "No synchronization performed yet",
      leetcode_tracker_last_sync_date: null,
    });

    this.initializeMessageListeners();
  }

  /**
   * Set up Chrome extension message listeners for UI communication.
   * Handles all message types from popup, content scripts, and other components.
   *
   * Message Types:
   * - updateDifficultyStats: Real-time counter updates when problems are solved
   * - getDataConfig: Environment configuration requests
   * - saveUserInfos: Authentication data storage
   * - syncSolvedProblems: Manual synchronization triggers
   * - requestInitialStats: Statistics data requests (triggers recalculation)
   */
  initializeMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const handlers = {
        updateDifficultyStats: () => {
          const success = this.stateManager.incrementCounter(
            request.difficulty
          );
          sendResponse({ success });
        },
        getDataConfig: () => {
          sendResponse(ENV);
        },
        saveUserInfos: () => {
          this.saveUserInfos(request);
          sendResponse({ success: true });
        },
        syncSolvedProblems: () => {
          this.startSync();
          sendResponse({ status: "started" });
        },
        requestInitialStats: () => {
          // Always recalculate counter when popup requests stats
          this.initCounter();
          sendResponse(null); // Send null initially, updated stats will be broadcast
        },
      };

      if (handlers[request.type]) {
        handlers[request.type]();
      }

      return true; // Keep message channel open for async responses
    });
  }

  /**
   * Save user authentication information to Chrome storage.
   * Stores GitHub username and access token for API authentication.
   *
   * @param {Object} request - Request object containing username and token
   */
  saveUserInfos(request) {
    chrome.storage.local.set({
      leetcode_tracker_username: request.username,
      leetcode_tracker_token: request.token,
    });
  }

  /**
   * Start the synchronization process and track progress.
   * Coordinates with SyncService and updates storage with results.
   *
   * Algorithm:
   * 1. Delegate synchronization to SyncService
   * 2. Monitor sync progress and handle results
   * 3. Update Chrome storage with sync status and messages
   * 4. Trigger counter recalculation on successful sync
   * 5. Handle errors gracefully and update status accordingly
   *
   * @returns {Promise<Object>} Sync result with success status and message
   */
  async startSync() {
    try {
      const result = await this.syncService.startSync();

      await chrome.storage.local.set({
        leetcode_tracker_last_sync_status: result.success
          ? "success"
          : "failed",
        leetcode_tracker_sync_in_progress: false,
        leetcode_tracker_last_sync_message: result.message,
        leetcode_tracker_last_sync_date: new Date().toISOString(),
      });

      if (result.success) {
        this.initCounter();
      }

      return result;
    } catch (error) {
      await chrome.storage.local.set({
        leetcode_tracker_last_sync_status: "failed",
        leetcode_tracker_sync_in_progress: false,
        leetcode_tracker_last_sync_message: error.message,
        leetcode_tracker_last_sync_date: new Date().toISOString(),
      });

      return {
        success: false,
        message: "Error during synchronization: " + error.message,
      };
    }
  }

  /**
   * Initialize or recalculate problem counters by fetching current repository state.
   * Combines GitHub repository data with LeetCode difficulty information.
   *
   * Algorithm:
   * 1. Validate user authentication and repository configuration
   * 2. Reset state manager to loading state
   * 3. Fetch problem list from GitHub repository in parallel with LeetCode difficulty data
   * 4. Create difficulty mapping from LeetCode API data
   * 5. Map repository problems to their difficulty levels
   * 6. Update state manager with calculated statistics
   * 7. Handle errors gracefully and ensure UI remains responsive
   *
   * This method is called:
   * - On extension startup if user is fully configured
   * - When repository configuration changes
   * - When popup requests initial statistics (ensures fresh data)
   * - After successful synchronization
   */
  async initCounter() {
    try {
      const {
        leetcode_tracker_token,
        leetcode_tracker_username,
        leetcode_tracker_repo,
      } = await chrome.storage.local.get([
        "leetcode_tracker_token",
        "leetcode_tracker_username",
        "leetcode_tracker_repo",
      ]);

      // Exit early if not fully configured
      if (
        !leetcode_tracker_token ||
        !leetcode_tracker_username ||
        !leetcode_tracker_repo
      ) {
        this.stateManager.state.loading = false;
        this.stateManager.state.isCountingComplete = true;
        this.stateManager.broadcastState();
        return;
      }

      this.stateManager.reset();

      // Fetch data in parallel for better performance
      const [problems, allQuestions] = await Promise.all([
        this.githubService.getAllLeetCodeProblems(),
        this.leetCodeService.fetchAllQuestionsDifficulty(),
      ]);

      // Create efficient lookup map for difficulty information
      const difficultyMap = new Map(
        allQuestions.map((q) => [q.questionId, q.difficulty])
      );

      // Map problems to their difficulties
      const difficulties = problems.map((problem) =>
        difficultyMap.get(problem.questionId)
      );

      this.stateManager.updateStats(difficulties);
    } catch (error) {
      // Ensure UI shows completed state even on error
      this.stateManager.state.loading = false;
      this.stateManager.state.isCountingComplete = true;
      this.stateManager.broadcastState();
    }
  }
}

/**
 * Extension installation and update handler.
 * Sets up default settings for new installations and updates.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    // Initialize default settings only if they don't exist
    chrome.storage.local.get("leetcode_tracker_code_submit", (result) => {
      if (result.leetcode_tracker_code_submit === undefined) {
        chrome.storage.local.set({
          leetcode_tracker_code_submit: true,
        });
      }
    });

    chrome.storage.local.get(
      "leetcode_tracker_sync_multiple_submission",
      (result) => {
        if (result.leetcode_tracker_sync_multiple_submission === undefined) {
          chrome.storage.local.set({
            leetcode_tracker_sync_multiple_submission: false,
          });
        }
      }
    );

    chrome.storage.local.get(
      "leetcode_tracker_comment_submission",
      (result) => {
        if (result.leetcode_tracker_comment_submission === undefined) {
          chrome.storage.local.set({
            leetcode_tracker_comment_submission: false,
          });
        }
      }
    );

    chrome.storage.local.get("leetcode_tracker_auto_sync", (result) => {
      if (result.leetcode_tracker_auto_sync === undefined) {
        chrome.storage.local.set({
          leetcode_tracker_auto_sync: true,
        });
      }
    });
  }
});

// Initialize the main controller
const controller = new LeetCodeTrackerController();

/**
 * Initialize counter on startup if user is fully configured.
 * Ensures statistics are available immediately when extension starts.
 */
chrome.runtime.onStartup.addListener(async () => {
  try {
    const {
      leetcode_tracker_token,
      leetcode_tracker_username,
      leetcode_tracker_repo,
      leetcode_tracker_mode,
    } = await chrome.storage.local.get([
      "leetcode_tracker_token",
      "leetcode_tracker_username",
      "leetcode_tracker_repo",
      "leetcode_tracker_mode",
    ]);

    if (
      leetcode_tracker_token &&
      leetcode_tracker_username &&
      leetcode_tracker_repo &&
      leetcode_tracker_mode
    ) {
      controller.initCounter();
    }
  } catch (error) {
    // Handle initialization errors gracefully
  }
});

/**
 * Listen for storage changes and recalculate counters when repository configuration changes.
 * Ensures statistics stay synchronized with repository changes.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.leetcode_tracker_repo || changes.leetcode_tracker_mode) {
      controller.initCounter();
    }
  }
});

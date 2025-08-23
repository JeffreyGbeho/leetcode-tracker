import LeetCodeService from "./leetcode-service.js";
import GithubService from "./github-service.js";
import Problem from "../models/problem.js";
import LanguageUtils from "../utils/language-utils.js";

/**
 * Service responsible for synchronizing LeetCode solutions with GitHub repository.
 * Handles parallel processing, rate limiting, retries, and progress tracking.
 */
export default class SyncService {
  /**
   * Initialize the SyncService with default configuration and stats tracking.
   */
  constructor() {
    this.leetcodeService = new LeetCodeService();

    this.isSyncing = false;
    this.stats = {
      total: 0,
      synced: 0,
      failed: 0,
      current: 0,
      processed: 0,
      skipped: 0,
    };

    this.pauseDuration = 30000; // 30 seconds pause for rate limiting
    this.failedProblems = [];
    this.maxRetries = 3;
    this.retryCount = 0;

    // GitHub operations queue to prevent concurrent conflicts
    this.githubQueue = [];
    this.githubProcessing = false;
  }

  /**
   * Start the synchronization process between LeetCode and GitHub.
   * Prevents multiple simultaneous syncs and manages the complete workflow.
   *
   * @returns {Promise<Object>} Result object with success status, message, and stats
   */
  async startSync() {
    const { leetcode_tracker_sync_in_progress } =
      await chrome.storage.local.get("leetcode_tracker_sync_in_progress");

    if (leetcode_tracker_sync_in_progress) {
      return {
        success: false,
        message: "Synchronization already in progress",
      };
    }

    await chrome.storage.local.set({
      leetcode_tracker_sync_in_progress: true,
      leetcode_tracker_last_sync_status: "in_progress",
      leetcode_tracker_last_sync_message: "Synchronization started...",
      leetcode_tracker_last_sync_date: new Date().toISOString(),
    });

    this.isSyncing = true;

    // Reset all counters and queues for fresh sync
    this.stats = {
      total: 0,
      synced: 0,
      failed: 0,
      current: 0,
      processed: 0,
      skipped: 0,
    };
    this.activePromises = new Map();
    this.failedProblems = [];
    this.retryCount = 0;
    this.githubQueue = [];
    this.githubProcessing = false;

    try {
      const solvedProblems = await this.leetcodeService.getSolvedProblems();
      this.stats.total = solvedProblems.length;

      const maxParallel = 5;
      await this.processProblemsQueue(solvedProblems, maxParallel);

      await this.waitForGithubQueueCompletion();

      const allProcessed = this.stats.processed === this.stats.total;
      const successMessage = `Synchronization completed. Total: ${this.stats.total}, New files: ${this.stats.synced}, Already existed: ${this.stats.skipped}, Failed: ${this.stats.failed}, Processed: ${this.stats.processed}`;

      try {
        await chrome.storage.local.set({
          leetcode_tracker_sync_in_progress: false,
          leetcode_tracker_last_sync_status: allProcessed
            ? "success"
            : "partial",
          leetcode_tracker_last_sync_date: new Date().toISOString(),
          leetcode_tracker_last_sync_message: successMessage,
        });
      } catch (error) {
        console.error(
          "Error when updating sync status in local storage: ",
          error
        );
      }

      this.isSyncing = false;

      return {
        success: allProcessed,
        message: successMessage,
        stats: this.stats,
      };
    } catch (error) {
      try {
        await chrome.storage.local.set({
          leetcode_tracker_sync_in_progress: false,
          leetcode_tracker_last_sync_status: "failed",
          leetcode_tracker_last_sync_date: new Date().toISOString(),
          leetcode_tracker_last_sync_message: error.message,
        });
      } catch (storageError) {
        console.error(
          "Error when updating sync status in local storage: ",
          storageError
        );
      }

      this.isSyncing = false;

      return {
        success: false,
        message: "Error fetching solved problems: " + error.message,
      };
    }
  }

  /**
   * Add a GitHub operation to the sequential processing queue.
   * This prevents concurrent GitHub API calls that could cause conflicts.
   *
   * @param {Function} operation - Async function to execute for GitHub operation
   * @returns {Promise} Promise that resolves when the operation completes
   */
  async processGithubOperation(operation) {
    return new Promise((resolve, reject) => {
      this.githubQueue.push({
        operation,
        resolve,
        reject,
      });

      this.processGithubQueue();
    });
  }

  /**
   * Process the GitHub operations queue sequentially.
   * Ensures only one GitHub operation runs at a time to prevent conflicts.
   */
  async processGithubQueue() {
    if (this.githubProcessing || this.githubQueue.length === 0) {
      return;
    }

    this.githubProcessing = true;

    while (this.githubQueue.length > 0) {
      const { operation, resolve, reject } = this.githubQueue.shift();

      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Small delay between GitHub operations to be respectful to API
      await this.sleep(100);
    }

    this.githubProcessing = false;
  }

  /**
   * Wait for all GitHub operations in the queue to complete.
   * Used to ensure synchronization doesn't finish before all files are created.
   */
  async waitForGithubQueueCompletion() {
    while (this.githubQueue.length > 0 || this.githubProcessing) {
      await this.sleep(100);
    }
  }

  /**
   * Utility function to pause execution for a specified duration.
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after the specified delay
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Process a queue of problems with controlled parallelism and retry logic.
   *
   * Algorithm:
   * 1. Process up to maxParallel problems simultaneously
   * 2. When API rate limit is hit, pause all processing for 60 seconds
   * 3. Failed problems are collected for retry attempts
   * 4. After processing all problems, retry failed ones up to maxRetries times
   * 5. Each retry cycle also includes a pause to respect rate limits
   *
   * @param {Array} problems - Array of LeetCode problems to process
   * @param {number} maxParallel - Maximum number of concurrent problem processors
   * @returns {Promise} Promise that resolves when all problems are processed
   */
  async processProblemsQueue(problems, maxParallel) {
    return new Promise((resolve) => {
      let nextIndex = 0;
      let isPaused = false;
      let problemsToProcess = [...problems];
      let pauseTimer = null;

      /**
       * Resume processing after a pause period.
       * Fills available slots with new problem processors.
       */
      const resumeSync = () => {
        isPaused = false;
        pauseTimer = null;

        const activeCount = this.activePromises.size;
        const slotsToFill = Math.min(
          maxParallel - activeCount,
          problemsToProcess.length - nextIndex
        );

        for (let i = 0; i < slotsToFill; i++) {
          startNextProblem();
        }
      };

      /**
       * Pause all processing due to API rate limits.
       * Sets a timer to automatically resume after pauseDuration.
       */
      const pauseAndScheduleResume = () => {
        if (!isPaused) {
          isPaused = true;

          if (pauseTimer) {
            clearTimeout(pauseTimer);
          }

          pauseTimer = setTimeout(resumeSync, this.pauseDuration);
        }
      };

      /**
       * Start processing the next problem in the queue.
       * Handles completion logic and retry cycles.
       */
      const startNextProblem = async () => {
        if (isPaused) {
          return;
        }

        if (nextIndex >= problemsToProcess.length) {
          if (this.activePromises.size === 0) {
            // All problems processed, check for retries
            if (
              this.failedProblems.length > 0 &&
              this.retryCount < this.maxRetries
            ) {
              this.retryCount++;
              problemsToProcess = [...this.failedProblems];
              this.failedProblems = [];
              nextIndex = 0;

              // Pause before retry to respect rate limits
              isPaused = true;
              if (pauseTimer) {
                clearTimeout(pauseTimer);
              }

              pauseTimer = setTimeout(() => {
                isPaused = false;
                pauseTimer = null;

                for (
                  let i = 0;
                  i < Math.min(maxParallel, problemsToProcess.length);
                  i++
                ) {
                  startNextProblem();
                }
              }, this.pauseDuration);

              return;
            } else if (this.failedProblems.length > 0) {
              // Max retries reached, count remaining failures
              this.stats.failed += this.failedProblems.length;
              this.stats.processed += this.failedProblems.length;
            }

            this.isSyncing = false;
            resolve();
          }
          return;
        }

        const problem = problemsToProcess[nextIndex];
        const currentIndex = nextIndex++;

        const promise = this.processProblem(problem, currentIndex).catch(
          (error) => {
            if (error.needsPause) {
              this.failedProblems.push(problem);
              pauseAndScheduleResume();
            }
            throw error;
          }
        );

        this.activePromises.set(currentIndex, promise);

        promise
          .then(() => {
            this.activePromises.delete(currentIndex);

            if (!isPaused) {
              startNextProblem();
            }
          })
          .catch((error) => {
            this.activePromises.delete(currentIndex);

            if (!isPaused) {
              startNextProblem();
            }
          });
      };

      // Start initial batch of problems
      for (
        let i = 0;
        i < Math.min(maxParallel, problemsToProcess.length);
        i++
      ) {
        startNextProblem();
      }
    });
  }

  /**
   * Process a single LeetCode problem by fetching submissions and creating GitHub files.
   *
   * Algorithm:
   * 1. Add random delay to avoid request patterns
   * 2. Fetch all submissions for the problem by language
   * 3. For each language submission, create a Problem object
   * 4. Queue GitHub operations to check/create files
   * 5. Track statistics based on whether files were created or already existed
   *
   * @param {Object} problem - LeetCode problem object with metadata
   * @param {number} index - Current processing index for progress tracking
   * @returns {Promise<boolean>} True if processing succeeded
   */
  async processProblem(problem, index) {
    this.stats.current = index + 1;

    try {
      const titleSlug = problem.stat.question__title_slug;

      // Random delay to avoid predictable request patterns
      await this.sleep(Math.random() * 300 + 200);

      const submissionsByLanguage =
        await this.leetcodeService.getSubmissionsByLanguage(titleSlug);

      let newFilesCreated = 0;
      let totalFilesForProblem = 0;

      for (const lang in submissionsByLanguage) {
        const submission = submissionsByLanguage[lang];

        const problemObj = new Problem();
        problemObj.slug = `${submission.questionId}-${submission.title}`;
        problemObj.difficulty = this.difficultyLevelToString(
          problem.difficulty.level
        );
        problemObj.language = LanguageUtils.getLanguageInfo(submission.lang);
        problemObj.code = submission.code;

        totalFilesForProblem++;

        // Use GitHub queue to prevent concurrent file operations
        const fileCreated = await this.processGithubOperation(async () => {
          // Create new GithubService instance for each operation to avoid conflicts
          const githubService = new GithubService();
          githubService.problem = problemObj;

          await githubService.init();
          const fileExists = await githubService.checkFileExistence(true);

          if (!fileExists) {
            await githubService.createFile(true);
            return true;
          }
          return false;
        });

        if (fileCreated) {
          newFilesCreated++;
        }
      }

      // Update statistics based on processing results
      if (newFilesCreated > 0) {
        this.stats.synced++;
      } else {
        this.stats.skipped++;
      }

      this.stats.processed++;

      return true;
    } catch (error) {
      if (error.needsPause) {
        // Don't increment failed/processed for rate limit errors as they'll be retried
        throw error;
      }

      // For non-rate-limit errors, count as permanent failure
      this.stats.failed++;
      this.stats.processed++;

      throw error;
    }
  }

  /**
   * Convert numeric difficulty level to human-readable string.
   *
   * @param {number} level - Difficulty level (1=Easy, 2=Medium, 3=Hard)
   * @returns {string} Human-readable difficulty string
   */
  difficultyLevelToString(level) {
    switch (level) {
      case 1:
        return "Easy";
      case 2:
        return "Medium";
      case 3:
        return "Hard";
      default:
        return "Unknown";
    }
  }
}

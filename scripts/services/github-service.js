import ConfigurationService from "./configuration-service.js";

/**
 * Service for managing GitHub repository operations for LeetCode problem synchronization.
 * Handles file creation, updates, and repository management with proper authentication.
 */
export default class GithubService {
  /**
   * Initialize GitHub service with independent instance isolation.
   * Each instance gets a unique ID to prevent concurrent operation conflicts.
   */
  constructor() {
    this.configurationService = new ConfigurationService();

    this.submissionInProgress = false;
    this.problem = null;
    this.comment = "";

    // Make each instance independent to prevent race conditions
    this.instanceId = Math.random().toString(36).substr(2, 9);
  }

  /**
   * Initialize the service by loading configuration settings from Chrome storage.
   * Must be called before performing any GitHub operations.
   *
   * @throws {Error} If configuration loading fails
   */
  async init() {
    try {
      this.userConfig = await this.configurationService.getChromeStorageConfig([
        "leetcode_tracker_repo",
        "leetcode_tracker_username",
        "leetcode_tracker_token",
      ]);
      this.dataConfig = await this.configurationService.getDataConfig();
      const result = await this.configurationService.getChromeStorageConfig([
        "leetcode_tracker_sync_multiple_submission"
      ]);
      this.syncMultipleSubmissionsSettingEnabled =
        result.leetcode_tracker_sync_multiple_submission || false;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Submit a LeetCode problem solution to GitHub repository.
   * Orchestrates the complete submission workflow with duplicate detection.
   *
   * Algorithm:
   * 1. Initialize configuration and validate settings
   * 2. Check if submission is already in progress (prevent duplicates)
   * 3. Verify file existence in repository
   * 4. Compare content if file exists and handle based on user settings
   * 5. Create new file or update existing one accordingly
   *
   * @param {Object} problem - Problem object containing code, metadata, and language info
   * @param {string} comment - Optional comment to include in the submission
   */
  async submitToGitHub(problem, comment = "") {
    await this.init();
    this.problem = problem;
    this.comment = comment;

    if (
      this.submissionInProgress ||
      !this.configurationService.isConfigValid(this.userConfig)
    ) {
      return;
    }

    this.submissionInProgress = true;

    try {
      const fileExists = await this.checkFileExistence();

      if (fileExists && !this.syncMultipleSubmissionsSettingEnabled) {
        const currentContent = atob(fileExists.content);
        const newContent = this.getFormattedCode();
        const result = await this.configurationService.getChromeStorageConfig([
          "leetcode_tracker_code_submit",
        ]);
        const skipDuplicates = result.leetcode_tracker_code_submit;
        const contentIsSame = !(await this.contentsDiffer(
          currentContent,
          newContent
        ));

        // Skip update if setting is enabled and content hasn't changed
        if (skipDuplicates && contentIsSame) {
          return;
        }

        await this.updateFile(fileExists);
      } else {
        await this.createFile();
      }
    } finally {
      this.submissionInProgress = false;
    }
  }

  /**
   * Update an existing file in the GitHub repository.
   *
   * @param {Object} existingFile - File object from GitHub API containing SHA and metadata
   * @returns {Promise<Response>} GitHub API response object
   * @throws {Error} If the update operation fails
   */
  async updateFile(existingFile) {
    const url = this.buildGitHubUrl(false);
    const currentDate = new Date().toLocaleString();

    const body = {
      message: `File updated at ${currentDate}`,
      content: this.utf8ToBase64(this.getFormattedCode()),
      sha: existingFile.sha, // Required for updates to prevent conflicts
    };

    const response = await this.fetchWithAuth(url, "PUT", body);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to update file: ${response.status} - ${
          errorData.message || "Unknown error"
        }`
      );
    }

    return response;
  }

  /**
   * Create a new file in the GitHub repository with optional README generation.
   *
   * Algorithm:
   * 1. Validate problem object exists
   * 2. Build appropriate GitHub URL for the target file
   * 3. Create the main solution file with formatted code
   * 4. Handle file conflicts gracefully (422 status for existing files)
   * 5. Create README file if problem description is available
   * 6. Update difficulty statistics if not in sync mode
   * 7. Log all operations with instance ID for debugging
   *
   * @param {boolean} isSyncing - Whether this is part of a bulk sync operation
   * @returns {Promise<Response>} GitHub API response object
   * @throws {Error} If file creation fails or problem object is invalid
   */
  async createFile(isSyncing = false) {
    if (!this.problem) {
      throw new Error("No problem set for file creation");
    }

    const codeUrl = this.buildGitHubUrl(isSyncing);
    const readmeUrl = this.buildGitHubUrl(isSyncing, "README.md");

    const codeBody = {
      message: `Create ${this.problem.slug}`,
      content: this.utf8ToBase64(this.getFormattedCode()),
    };

    try {
      const result = await this.fetchWithAuth(codeUrl, "PUT", codeBody);

      if (!result.ok) {
        const errorData = await result.json().catch(() => ({}));

        // Handle file already exists scenario gracefully
        if (
          result.status === 422 &&
          errorData.message?.includes("already exists")
        ) {
          return result;
        }

        throw new Error(
          `Failed to create file: ${result.status} - ${
            errorData.message || "Unknown error"
          }`
        );
      }

      const resultJson = await result.json();

      if (result.status === 201) {
        try {
          // Create README only if description exists and is meaningful
          if (this.problem.description && this.problem.description.trim()) {
            const readmeBody = {
              message: `Add README for ${this.problem.slug}`,
              content: this.utf8ToBase64(this.problem.description),
            };

            const readmeResult = await this.fetchWithAuth(
              readmeUrl,
              "PUT",
              readmeBody
            );

            // Don't fail main operation if README creation fails
            if (!readmeResult.ok) {
              // README creation failed but continue with main operation
            }
          }
        } catch (readmeError) {
          // Don't fail main file creation due to README issues
        } finally {
          // Update statistics only in normal mode (not during bulk sync)
          if (!isSyncing) {
            try {
              chrome.runtime.sendMessage({
                type: "updateDifficultyStats",
                difficulty: this.problem.difficulty,
              });
            } catch (messageError) {
              // Statistics update failed but don't fail the main operation
            }
          }
        }
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Compare two content strings to determine if they differ significantly.
   * Normalizes whitespace and line endings for accurate comparison.
   *
   * @param {string} currentContent - Existing file content
   * @param {string} newContent - New content to compare
   * @returns {Promise<boolean>} True if contents differ, false if they're the same
   */
  async contentsDiffer(currentContent, newContent) {
    const normalize = (content) =>
      content.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
    return normalize(currentContent) !== normalize(newContent);
  }

  /**
   * Check if a file already exists in the GitHub repository.
   *
   * @param {boolean} isSyncing - Whether this is part of a bulk sync operation
   * @returns {Promise<Object|null>} File object if exists, null if not found
   * @throws {Error} If problem object is missing or API request fails
   */
  async checkFileExistence(isSyncing = false) {
    if (!this.problem) {
      throw new Error("No problem set for file existence check");
    }

    const url = this.buildGitHubUrl(isSyncing);

    try {
      const response = await this.fetchWithAuth(url, "GET");

      if (response.ok) {
        return await response.json();
      } else if (response.status === 404) {
        // File doesn't exist, which is expected for new files
        return null;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to check file existence: ${response.status} - ${
            errorData.message || "Unknown error"
          }`
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Format the problem code with appropriate headers and comments.
   * Generates language-specific comment formats and includes metadata.
   *
   * Algorithm:
   * 1. Validate problem and code availability
   * 2. Get appropriate comment format for the programming language
   * 3. Create header with last updated timestamp
   * 4. Add user comment if provided (handles both single and multi-line)
   * 5. Append the actual solution code
   *
   * @returns {string} Formatted code string with headers and comments
   * @throws {Error} If problem or code is not available
   */
  getFormattedCode() {
    if (!this.problem || !this.problem.code) {
      throw new Error("No problem or code available for formatting");
    }

    const currentDate = new Date().toLocaleString();

    // Get appropriate comment format for the programming language
    const commentFormat = this.getCommentFormat(
      this.problem.language.extension
    );

    // Create header with timestamp
    let header = `${commentFormat.line} Last updated: ${currentDate}\n`;

    // Add user comment if provided
    if (this.comment && this.comment.trim()) {
      // Handle multi-line comments with proper formatting
      if (this.comment.includes("\n")) {
        header += `${commentFormat.start}\n`;

        // Format each line of the comment
        this.comment.split("\n").forEach((line) => {
          header += `${commentFormat.linePrefix}${line}\n`;
        });

        header += `${commentFormat.end}\n\n`;
      } else {
        // Single line comment
        header += `${commentFormat.line} ${this.comment}\n`;
      }
    }

    // Combine header with actual code
    return header + this.problem.code;
  }

  /**
   * Get the appropriate comment format for different programming languages.
   * Supports both single-line and multi-line comment styles.
   *
   * @param {string} extension - File extension (e.g., ".js", ".py", ".java")
   * @returns {Object} Object containing comment format strings for the language
   */
  getCommentFormat(extension) {
    switch (extension) {
      case ".py":
        return {
          line: "#",
          start: "'''",
          end: "'''",
          linePrefix: "",
        };
      case ".rb":
        return {
          line: "#",
          start: "=begin",
          end: "=end",
          linePrefix: "",
        };
      case ".php":
        return {
          line: "//",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
      case ".js":
      case ".ts":
      case ".kt":
      case ".java":
      case ".c":
      case ".cpp":
      case ".cs":
      case ".swift":
      case ".scala":
      case ".dart":
      case ".go":
        return {
          line: "//",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
      case ".rs":
        return {
          line: "//",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
      case ".ex":
        return {
          line: "#",
          start: '@doc """',
          end: '"""',
          linePrefix: "",
        };
      case ".erl":
        return {
          line: "%",
          start: "%% ---",
          end: "%% ---",
          linePrefix: "%% ",
        };
      case ".rkt":
        return {
          line: ";",
          start: "#|",
          end: "|#",
          linePrefix: " ",
        };
      case ".sql":
        return {
          line: "--",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
      default:
        // Default to C-style comments for unknown languages
        return {
          line: "//",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
    }
  }

  /**
   * Convert UTF-8 string to Base64 encoding for GitHub API.
   * Handles Unicode characters properly for international content.
   *
   * @param {string} str - UTF-8 string to encode
   * @returns {string} Base64 encoded string
   */
  utf8ToBase64(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode("0x" + p1)
      )
    );
  }

  /**
   * Build the GitHub API URL for file operations.
   * Constructs repository path with optional versioning support.
   *
   * Algorithm:
   * 1. Validate problem object exists
   * 2. Add timestamp suffix if multiple submissions are enabled
   * 3. Create version path for language-specific organization
   * 4. Combine all components into complete GitHub API URL
   *
   * @param {boolean} isSyncing - Whether this is part of bulk sync (affects versioning)
   * @param {string} file - Optional specific filename override
   * @returns {string} Complete GitHub API URL for file operations
   * @throws {Error} If problem object is not set
   */
  buildGitHubUrl(isSyncing, file = "") {
    if (!this.problem) {
      throw new Error("No problem set for URL building");
    }

    let sanitizedSlug = this.problem.slug || "";

    sanitizedSlug = sanitizedSlug.trim().replace(/^\/+|\/+$/g, '');

    sanitizedSlug = sanitizedSlug.replace(/\/+/g, '/');

    if (!sanitizedSlug || sanitizedSlug === '/' || sanitizedSlug === '-') {
      sanitizedSlug = `problem-${Date.now()}`;
    }

    const dateTime =
      this.syncMultipleSubmissionsSettingEnabled && !isSyncing
        ? `_${this.getLocalTimeString()}`
        : "";

    const fileName =
      file ||
      `${sanitizedSlug}${dateTime}${this.problem.language.extension}`;
    const versionPath =
      this.syncMultipleSubmissionsSettingEnabled && !isSyncing
        ? `/version/${this.problem.language.langName}`
        : "";

    return `${this.dataConfig.REPOSITORY_URL}${this.userConfig.leetcode_tracker_username}/${this.userConfig.leetcode_tracker_repo}/contents/${sanitizedSlug}${versionPath}/${fileName}`;
  }

  /**
   * Execute authenticated HTTP requests to GitHub API.
   * Handles authentication headers and request configuration.
   *
   * @param {string} url - GitHub API endpoint URL
   * @param {string} method - HTTP method (GET, PUT, POST, etc.)
   * @param {Object} body - Optional request body for PUT/POST requests
   * @returns {Promise<Response>} Fetch API response object
   * @throws {Error} If network request fails
   */
  async fetchWithAuth(url, method, body = null) {
    const options = {
      method,
      headers: {
        ...this.dataConfig.HEADERS,
        Authorization: `token ${this.userConfig.leetcode_tracker_token}`,
      },
    };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate a timestamp string for versioning multiple submissions.
   * Creates a sortable datetime string in YYYYMMDD_HHMMSS format.
   *
   * @returns {string} Formatted timestamp string for file versioning
   */
  getLocalTimeString() {
    const now = new Date();

    // Format: YYYYMMDD_HHMMSS
    return (
      now.getFullYear() +
      ("0" + (now.getMonth() + 1)).slice(-2) +
      ("0" + now.getDate()).slice(-2) +
      "_" +
      ("0" + now.getHours()).slice(-2) +
      ("0" + now.getMinutes()).slice(-2) +
      ("0" + now.getSeconds()).slice(-2)
    );
  }
}

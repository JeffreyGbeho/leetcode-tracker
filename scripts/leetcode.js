const languageExtensions = {
  cpp: ".cpp",
  java: ".java",
  python: ".py",
  python3: ".py",
  c: ".c",
  csharp: ".cs",
  javascript: ".js",
  typescript: ".ts",
  php: ".php",
  swift: ".swift",
  kotlin: ".kt",
  dart: ".dart",
  golang: ".go",
  ruby: ".rb",
  scala: ".scala",
  rust: ".rs",
  racket: ".rkt",
  erlang: ".erl",
  elixir: ".ex",
};

class Problem {
  constructor() {
    this.name = "";
    this.slug = "";
    this.difficulty = "";
    this.description = "";
    this.utilsService = new Utils();
  }

  async updateFromDOM() {
    this.updateSlug();
    this.updateDescription();
    this.updateDifficulty();
  }

  async updateSlug() {
    const hrefSelector = window.location.pathname.replace("description/", "");

    const problemNameSelector = await this.utilsService.waitForElement(
      `a[href='${hrefSelector}']`
    );

    if (problemNameSelector) {
      this.slug = this.formatProblemName(problemNameSelector.textContent);
    }
  }

  updateDifficulty() {
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

  async updateDescription() {
    const problemDescription = await this.utilsService.waitForElement(
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

class Github {
  constructor(problem) {
    this.submissionInProgress = false;
    this.problem = problem;
  }

  getLanguageExtension() {
    const language = JSON.parse(window.localStorage.getItem("global_lang"));
    return languageExtensions[language] || null;
  }

  getFormattedCode() {
    const language = JSON.parse(window.localStorage.getItem("global_lang"));
    const codeElement = document.querySelector(`code.language-${language}`);
    return codeElement ? codeElement.textContent : "";
  }

  async submitToGitHub(dataConfig, userConfig) {
    if (this.submissionInProgress) return;
    this.submissionInProgress = true;

    const fileExists = await this.checkFileExistence(dataConfig, userConfig);
    if (fileExists) {
      await this.updateFile(dataConfig, userConfig, fileExists);
    } else {
      await this.createFile(dataConfig, userConfig);
    }

    this.submissionInProgress = false;
  }

  async checkFileExistence(dataConfig, userConfig) {
    const url = this.buildGitHubUrl(dataConfig, userConfig);
    const response = await this.fetchWithAuth(
      url,
      "GET",
      dataConfig,
      userConfig
    );
    return response.ok ? await response.json() : null;
  }

  async updateFile(dataConfig, userConfig, existingFile) {
    const url = this.buildGitHubUrl(dataConfig, userConfig);
    const body = {
      message: `Update file ${new Date().toLocaleString()}`,
      content: btoa(this.getFormattedCode()),
      sha: existingFile.sha,
    };
    await this.fetchWithAuth(url, "PUT", dataConfig, userConfig, body);
  }

  async createFile(dataConfig, userConfig) {
    const codeUrl = this.buildGitHubUrl(dataConfig, userConfig);
    const readmeUrl = this.buildGitHubUrl(dataConfig, userConfig, "README.md");

    const codeBody = {
      message: "Create file",
      content: btoa(this.getFormattedCode()),
    };

    const result = await this.fetchWithAuth(
      codeUrl,
      "PUT",
      dataConfig,
      userConfig,
      codeBody
    );
    const resultJson = await result.json();

    if (result.status === 201) {
      try {
        const readmeBody = {
          message: "Adding readme file",
          content: this.utf8ToBase64(
            this.problem.description ? this.problem.description : ""
          ),
          sha: resultJson.commit.sha,
        };

        await this.fetchWithAuth(
          readmeUrl,
          "PUT",
          dataConfig,
          userConfig,
          readmeBody
        );
      } finally {
        chrome.runtime.sendMessage({
          type: "updateDifficultyStats",
          difficulty: this.problem.difficulty,
        });
      }
    }
  }

  utf8ToBase64(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode("0x" + p1)
      )
    );
  }

  buildGitHubUrl(dataConfig, userConfig, file = "") {
    const fileName =
      file || `${this.problem.slug}${this.getLanguageExtension()}`;
    return `${dataConfig.REPOSITORY_URL}${userConfig.leetcode_tracker_username}/${userConfig.leetcode_tracker_repo}/contents/${this.problem.slug}/${fileName}`;
  }

  async fetchWithAuth(url, method, dataConfig, userConfig, body = null) {
    const options = {
      method,
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${userConfig.leetcode_tracker_token}`,
      },
    };
    if (body) options.body = JSON.stringify(body);
    return fetch(url, options);
  }
}

class Route {
  constructor() {
    this.utilsService = new Utils();
    this.problemSlug = this.extractProblemSlugFromUrl(location.pathname);
    this.observeUrlChanges();
  }

  observeUrlChanges() {
    const observer = new MutationObserver(() => {
      if (
        this.problemSlug !== this.extractProblemSlugFromUrl(location.pathname)
      ) {
        observer.disconnect();
        this.problemSlug = this.extractProblemSlugFromUrl(location.pathname);

        setTimeout(() => {
          tracker.init();
        }, 1000);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });
  }

  extractProblemSlugFromUrl(pathname) {
    const match = pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }
}

class Utils {
  constructor() {}

  async waitForElement(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          resolve(document.querySelector(selector));
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }
}

class LeetcodeTracker {
  constructor() {
    this.start();
  }

  start() {
    this.utilsService = new Utils();
    this.problem = new Problem();
    this.github = new Github(this.problem);
    this.route = new Route();
  }

  async init() {
    this.start();

    await this.utilsService.waitForElement(
      'button[data-e2e-locator="console-submit-button"]:not([data-state="closed"])'
    );
    this.problem.updateFromDOM();
    this.setupSubmitButton();
  }

  setupSubmitButton() {
    const submitButton = document.querySelector(
      'button[data-e2e-locator="console-submit-button"]'
    );
    submitButton.addEventListener("click", () => {
      this.handleSubmission();
    });
  }

  async handleSubmission() {
    await this.utilsService.waitForElement(
      'span[data-e2e-locator="submission-result"]'
    );
    const accepted = document.querySelector(
      'span[data-e2e-locator="submission-result"]'
    );
    if (accepted && accepted.textContent === "Accepted") {
      this.submitToGithub();
    }
  }

  async submitToGithub() {
    const userConfig = await this.getUserConfig();
    if (this.isConfigValid(userConfig)) {
      const dataConfig = await this.getDataConfig();
      await this.github.submitToGitHub(dataConfig, userConfig);
    }
  }

  async getUserConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "leetcode_tracker_repo",
          "leetcode_tracker_username",
          "leetcode_tracker_token",
        ],
        resolve
      );
    });
  }

  isConfigValid(config) {
    return (
      config.leetcode_tracker_repo &&
      config.leetcode_tracker_username &&
      config.leetcode_tracker_token
    );
  }

  async getDataConfig() {
    return chrome.runtime.sendMessage({ type: "getDataConfig" });
  }
}

var tracker = new LeetcodeTracker();
tracker.init();

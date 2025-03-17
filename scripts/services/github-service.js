import LanguageUtils from "/scripts/utils/language-utils.js";
import ConfigurationService from "/scripts/services/configuration-service.js";

export default class GithubService {
  constructor(problem) {
    this.submissionInProgress = false;
    this.problem = problem;
    this.configurationService = new ConfigurationService();
  }

  async init() {
    try {
      this.userConfig = await this.configurationService.getChromeStorageConfig([
        "leetcode_tracker_repo",
        "leetcode_tracker_username",
        "leetcode_tracker_token",
      ]);
      this.dataConfig = await this.configurationService.getDataConfig();
    } catch (error) {
      console.error("Error initializing GithubService:", error);
    }
  }

  async submitToGitHub() {
    await this.init();

    if (
      this.submissionInProgress ||
      !this.configurationService.isConfigValid(this.userConfig)
    ) {
      return;
    }

    this.submissionInProgress = true;

    const fileExists = await this.checkFileExistence();
    if (fileExists) {
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

    this.submissionInProgress = false;
  }

  async updateFile(existingFile) {
    const url = this.buildGitHubUrl();
    const currentDate = new Date().toLocaleString();
    const result = await chrome.storage.local.get(
      "leetcode_tracker_code_submit"
    );
    const skipDuplicates = result.leetcode_tracker_code_submit;
    const codeWithTimestamp = skipDuplicates
      ? this.getFormattedCode()
      : `// Last updated: ${currentDate}\n${this.getFormattedCode()}`;

    const body = {
      message: `File updated at ${currentDate}`,
      content: btoa(codeWithTimestamp),
      sha: existingFile.sha,
    };
    await this.fetchWithAuth(url, "PUT", body);
  }

  async createFile() {
    const codeUrl = this.buildGitHubUrl();
    const readmeUrl = this.buildGitHubUrl("README.md");

    const codeBody = {
      message: "Create file",
      content: btoa(this.getFormattedCode()),
    };

    const result = await this.fetchWithAuth(codeUrl, "PUT", codeBody);
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

        await this.fetchWithAuth(readmeUrl, "PUT", readmeBody);
      } finally {
        chrome.runtime.sendMessage({
          type: "updateDifficultyStats",
          difficulty: this.problem.difficulty,
        });
      }
    }
  }

  async contentsDiffer(currentContent, newContent) {
    const normalize = (content) =>
      content.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
    return normalize(currentContent) !== normalize(newContent);
  }

  async checkFileExistence() {
    const url = this.buildGitHubUrl();
    const response = await this.fetchWithAuth(url, "GET");
    return response.ok ? await response.json() : null;
  }

  getLanguageExtension() {
    const language =
      JSON.parse(window.localStorage.getItem("global_lang")) ||
      document.querySelector("#headlessui-popover-button-\\:r1s\\: button")
        ?.textContent;

    return LanguageUtils.getLanguageInfo(language).extension;
  }

  getFormattedCode() {
    const languageKey =
      JSON.parse(window.localStorage.getItem("global_lang")) ||
      document.querySelector("#headlessui-popover-button-\\:r1s\\: button")
        ?.textContent;
    const language = LanguageUtils.getLanguageInfo(languageKey).langName;

    const codeElements = document.querySelectorAll(`code.language-${language}`);

    return codeElements
      ? codeElements[codeElements.length - 1].textContent
      : "";
  }

  utf8ToBase64(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode("0x" + p1)
      )
    );
  }

  buildGitHubUrl(file = "") {
    const fileName =
      file || `${this.problem.slug}${this.getLanguageExtension()}`;
    return `${this.dataConfig.REPOSITORY_URL}${this.userConfig.leetcode_tracker_username}/${this.userConfig.leetcode_tracker_repo}/contents/${this.problem.slug}/${fileName}`;
  }

  async fetchWithAuth(url, method, body = null) {
    const options = {
      method,
      headers: {
        ...this.dataConfig.HEADERS,
        Authorization: `token ${this.userConfig.leetcode_tracker_token}`,
      },
    };
    if (body) options.body = JSON.stringify(body);
    return fetch(url, options);
  }
}

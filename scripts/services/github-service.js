import LanguageUtils from "/scripts/utils/language-utils.js";
import ConfigurationService from "/scripts/services/configuration-service.js";

export default class GithubService {
  constructor(problem) {
    this.submissionInProgress = false;
    this.problem = problem;
    this.comment = "";
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
      const result = await chrome.storage.local.get(
        "leetcode_tracker_sync_multiple_submission"
      );
      this.syncMultipleSubmissionsSettingEnabled =
        result.leetcode_tracker_sync_multiple_submission || false;
    } catch (error) {
      console.error("Error initializing GithubService:", error);
    }
  }

  async submitToGitHub(comment = "") {
    await this.init();
    this.comment = comment;

    if (
      this.submissionInProgress ||
      !this.configurationService.isConfigValid(this.userConfig)
    ) {
      return;
    }

    this.submissionInProgress = true;

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

    this.submissionInProgress = false;
  }

  async updateFile(existingFile) {
    const url = this.buildGitHubUrl();
    const currentDate = new Date().toLocaleString();

    const body = {
      message: `File updated at ${currentDate}`,
      content: btoa(this.getFormattedCode()),
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
    const extension = LanguageUtils.getLanguageInfo(languageKey).extension;

    const codeElements = document.querySelectorAll(`code.language-${language}`);
    const currentDate = new Date().toLocaleString();

    // Si aucun élément de code n'est trouvé, retourner une chaîne vide
    if (!codeElements || codeElements.length === 0) {
      return "";
    }

    // Obtenir le format de commentaire approprié pour le langage
    const commentFormat = this.getCommentFormat(extension);

    // Créer l'en-tête avec la date
    let header = `${commentFormat.line} Last updated: ${currentDate}\n`;

    // Ajouter le commentaire s'il existe
    if (this.comment && this.comment.trim()) {
      // Pour les commentaires multilignes, utiliser le format approprié
      if (this.comment.includes("\n")) {
        header += `${commentFormat.start}\n`;

        // Formater chaque ligne du commentaire
        this.comment.split("\n").forEach((line) => {
          header += `${commentFormat.linePrefix}${line}\n`;
        });

        header += `${commentFormat.end}\n\n`;
      } else {
        // Pour les commentaires courts d'une seule ligne
        header += `${commentFormat.line} ${this.comment}\n`;
      }
    }

    // Ajouter le code
    return header + codeElements[codeElements.length - 1].textContent;
  }

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
      default:
        return {
          line: "//",
          start: "/*",
          end: "*/",
          linePrefix: " * ",
        };
    }
  }

  utf8ToBase64(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode("0x" + p1)
      )
    );
  }

  buildGitHubUrl(file = "") {
    const lang = window.localStorage.getItem("global_lang").replaceAll('"', "");
    const dateTime = this.syncMultipleSubmissionsSettingEnabled
      ? `_${this.getLocalTimeString()}`
      : "";

    const fileName =
      file || `${this.problem.slug}${dateTime}${this.getLanguageExtension()}`;
    const versionPath = this.syncMultipleSubmissionsSettingEnabled
      ? `/version/${lang}`
      : "";

    return `${this.dataConfig.REPOSITORY_URL}${this.userConfig.leetcode_tracker_username}/${this.userConfig.leetcode_tracker_repo}/contents/${this.problem.slug}${versionPath}/${fileName}`;
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

  getLocalTimeString() {
    const now = new Date();

    // Format YYYYMMDD_HHMMSS
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

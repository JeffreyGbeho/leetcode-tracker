const DOM = {
  authenticate: document.getElementById("authenticate"),
  hookRepo: document.getElementById("hook-repo"),
  authenticated: document.getElementById("authenticated"),
  repoName: document.getElementById("repo-name"),
  repoNameError: document.getElementById("repo-name-error"),
  hookButton: document.getElementById("hook-button"),
  unlinkButton: document.getElementById("unlink-button"),
  stats: {
    easy: document.getElementById("easy"),
    medium: document.getElementById("medium"),
    hard: document.getElementById("hard"),
    problemsSolved: document.getElementById("problems-solved"),
  },
};

class PopupManager {
  constructor() {
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    document.addEventListener("DOMContentLoaded", this.setupLinks.bind(this));
    DOM.authenticate.addEventListener(
      "click",
      this.handleAuthentication.bind(this)
    );
    DOM.hookButton.addEventListener("click", this.handleHookRepo.bind(this));
    DOM.unlinkButton.addEventListener("click", this.unlinkRepo.bind(this));
  }

  setupLinks() {
    document.querySelectorAll("a.link").forEach((link) => {
      link.onclick = () => chrome.tabs.create({ active: true, url: link.href });
    });
  }

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

    this.updateStats();
  }

  async logout() {
    try {
      await chrome.storage.local.remove([
        "leetcode_tracker_token",
        "leetcode_tracker_username",
        "leetcode_tracker_mode",
        "leetcode_tracker_repo",
      ]);
      DOM.authenticate.style.display = "block";
      DOM.hookRepo.style.display = "none";
      DOM.authenticated.style.display = "none";
    } catch (error) {
      console.error("Error logging out:", error);
    }
  }

  async updateStats() {
    const { leetcode_tracker_stats } = await chrome.storage.local.get(
      "leetcode_tracker_stats"
    );
    if (leetcode_tracker_stats) {
      Object.keys(DOM.stats).forEach((key) => {
        DOM.stats[key].textContent = leetcode_tracker_stats[key] || 0;
      });
    }
  }

  async handleAuthentication() {
    try {
      const data = await chrome.runtime.sendMessage({ type: "getDataConfig" });
      const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${
        data.REDIRECT_URL
      }&scope=${data.SCOPES.join(" ")}`;
      chrome.tabs.create({ url, active: true });
    } catch (error) {
      console.error("Authentication error:", error);
    }
  }

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
      console.error("Error linking repository:", error);
      DOM.repoNameError.textContent =
        "An error occurred while linking the repository";
    }
  }

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

  async unlinkRepo() {
    try {
      await chrome.storage.local.remove([
        "leetcode_tracker_mode",
        "leetcode_tracker_repo",
      ]);
      DOM.authenticated.style.display = "none";
      DOM.hookRepo.style.display = "block";
    } catch (error) {
      console.error("Error unlinking repository:", error);
    }
  }
}

const popupManager = new PopupManager();
popupManager.checkAuthStatus();

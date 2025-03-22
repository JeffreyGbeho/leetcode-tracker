import { ENV } from "./environment.js";

class LeetCodeStateManager {
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

  getStats() {
    return {
      ...this.state.counter,
      isCountingComplete: this.state.isCountingComplete,
      lastUpdate: this.state.lastUpdate,
      loading: this.state.loading,
    };
  }

  reset() {
    this.state.counter = { easy: 0, medium: 0, hard: 0 };
    this.state.isCountingComplete = false;
    this.state.lastUpdate = null;
    this.state.loading = true;
  }

  broadcastState() {
    chrome.runtime
      .sendMessage({
        type: "statsUpdate",
        data: this.getStats(),
      })
      .catch(() => {
        // Do nothing
      });
  }
}

class GitHubService {
  constructor(env) {
    this.env = env;
  }

  async buildBasicGithubUrl() {
    const result = await chrome.storage.local.get([
      "leetcode_tracker_username",
      "leetcode_tracker_repo",
    ]);
    return `${this.env.REPOSITORY_URL}${result.leetcode_tracker_username}/${result.leetcode_tracker_repo}/contents/`;
  }

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

  convertGithubToLeetCodeSlug(githubFileName) {
    const [number] = githubFileName.split("-");
    return number;
  }
}

class LeetCodeService {
  async fetchAllQuestionsDifficulty() {
    const graphqlQuery = {
      query: `
        query allQuestions {
          allQuestions {
            questionId
            difficulty
          }
        }
      `,
    };

    try {
      const response = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graphqlQuery),
      });

      const data = await response.json();
      return data.data.allQuestions;
    } catch (error) {
      return [];
    }
  }
}

class LeetCodeTrackerController {
  constructor() {
    this.stateManager = new LeetCodeStateManager();
    this.githubService = new GitHubService(ENV);
    this.leetCodeService = new LeetCodeService();

    this.initializeMessageListeners();
  }

  initializeMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.type) {
        case "updateDifficultyStats":
          const success = this.stateManager.incrementCounter(
            request.difficulty
          );
          sendResponse({ success });
          break;
        case "getDataConfig":
          sendResponse(ENV);
          break;
        case "saveUserInfos":
          this.saveUserInfos(request);
          break;
        case "requestInitialStats":
          if (this.stateManager.state.loading) {
            sendResponse(null);
          } else {
            sendResponse(this.stateManager.getStats());
          }
          break;
      }
      return true;
    });
  }

  saveUserInfos(request) {
    chrome.storage.local.set({
      leetcode_tracker_username: request.username,
      leetcode_tracker_token: request.token,
    });
  }

  async initCounter() {
    try {
      this.stateManager.reset();

      const problems = await this.githubService.getAllLeetCodeProblems();

      const allQuestions =
        await this.leetCodeService.fetchAllQuestionsDifficulty();

      const difficultyMap = new Map(
        allQuestions.map((q) => [q.questionId, q.difficulty])
      );

      const difficulties = problems.map((problem) =>
        difficultyMap.get(problem.questionId)
      );

      this.stateManager.updateStats(difficulties);
    } catch (error) {
      this.stateManager.state.loading = false;
      this.stateManager.state.isCountingComplete = true;
      this.stateManager.broadcastState();
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
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
  }
});

// Initialisation
const controller = new LeetCodeTrackerController();
controller.initCounter();

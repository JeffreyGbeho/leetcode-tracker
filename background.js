import { ENV } from "./environment.js";

let leetcodeCounterDifficulty = {
  easy: 0,
  medium: 0,
  hard: 0,
};

/**
 * Save github's user infors in the local storage
 * @param {*} request // Data send by the content script.
 */
function saveUserInfos(request) {
  chrome.storage.local.set(
    { leetcode_tracker_username: request.username },
    () => {}
  );

  chrome.storage.local.set({ leetcode_tracker_token: request.token }, () => {});
}

/**
 * Update the stats of the user in the local storage to display them in the popup.
 * @param {*} request // Data send by the content script.
 */
function updateStats(request) {
  leetcodeCounterDifficulty[request.difficulty.toLowerCase()] += 1;
}

/**
 * Listen for messages from the content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "getDataConfig") {
    sendResponse(ENV);
  } else if (request.type === "saveUserInfos") {
    saveUserInfos(request);
  } else if (request.type === "updateDifficultyStats") {
    updateStats(request);
  } else if (request.type === "getStats") {
    sendResponse(leetcodeCounterDifficulty);
  }
});

/**
 * COUNTER
 */

async function initCounter() {
  const githubProblems = await getAllLeetCodeProblems();

  const leetcodeProblemSlugs = githubProblems
    .filter((problem) => /^\d+-[A-Z]/.test(problem.name))
    .map((problem) => ({
      originalName: problem.name,
      questionId: convertGithubToLeetCodeSlug(problem.name),
    }));

  leetcodeProblemSlugs.forEach(async (problem) => {
    const difficulty = await fetchProblemDifficulty(problem.questionId);
    leetcodeCounterDifficulty[difficulty.toLowerCase()] += 1;
  });
}

/**
 * Get all leetcode problems from a github repository
 */
async function getAllLeetCodeProblems() {
  try {
    const url = await buildBasicGitubUrl();

    const response = await fetch(url);

    return await response.json();
  } catch (error) {
    console.error("Error fetching repository contents:", error);
    return [];
  }
}

async function buildBasicGitubUrl() {
  const result = await chrome.storage.local.get([
    "leetcode_tracker_username",
    "leetcode_tracker_repo",
  ]);

  return `${ENV.REPOSITORY_URL}${result.leetcode_tracker_username}/${result.leetcode_tracker_repo}/contents/`;
}

function convertGithubToLeetCodeSlug(githubFileName) {
  let [number, ...nameParts] = githubFileName.split("-");

  return number;
}

async function fetchProblemDifficulty(problemId) {
  const graphqlQuery = {
    query: `
      query allQuestions {
        allQuestions {
          title
          titleSlug
          questionId
          difficulty
        }
      }
    `,
  };

  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    });

    const data = await response.json();

    const question = data.data.allQuestions.find(
      (question) => question.questionId === problemId
    );

    return question.difficulty;
  } catch (error) {
    console.error("Error fetching problems:", error);
    return null;
  }
}

initCounter();

import { config } from "./config.js";

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
  chrome.storage.local.get(["leetcode_tracker_stats"], (result) => {
    const stats = result.leetcode_tracker_stats
      ? result.leetcode_tracker_stats
      : {};

    stats[request.difficulty] =
      stats[request.difficulty] > 0 ? stats[request.difficulty] + 1 : 1;
    stats.problemsSolved =
      stats.problemsSolved > 0 ? stats.problemsSolved + 1 : 1;

    chrome.storage.local.set({ leetcode_tracker_stats: stats }, () => {});
  });
}

/**
 * Listen for messages from the content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "getDataConfig") {
    sendResponse(config);
  } else if (request.type === "saveUserInfos") {
    saveUserInfos(request);
  } else if (request.type === "updateDifficultyStats") {
    updateStats(request);
  }
});

(async () => {
  try {
    const src = chrome.runtime.getURL("scripts/leetcode.js");
    const mainModule = await import(src);

    // Initialize LeetcodeTracker
    new mainModule.default();
  } catch (error) {
    console.error("Error loading LeetCode Tracker modules:", error);
  }
})();

chrome.storage.local.get(
  [
    "leetcode_tracker_token",
    "leetcode_tracker_username",
    "leetcode_tracker_mode",
    "leetcode_tracker_repo",
  ],
  (result) => {
    if (!result.leetcode_tracker_token || !result.leetcode_tracker_username) {
      document.getElementById("authenticate").style.display = "block";
    } else if (!result.leetcode_tracker_repo || !result.leetcode_tracker_mode) {
      document.getElementById("hook-repo").style.display = "block";
    } else {
      document.getElementById("authenticated").style.display = "block";
    }
  }
);

chrome.storage.local.get("leetcode_tracker_stats", (result) => {
  if (result.leetcode_tracker_stats) {
    const stats = result.leetcode_tracker_stats;

    document.getElementById("easy").textContent = stats.easy ? stats.easy : 0;
    document.getElementById("medium").textContent = stats.medium
      ? stats.medium
      : 0;
    document.getElementById("hard").textContent = stats.hard ? stats.hard : 0;
    document.getElementById("problems-solved").textContent =
      stats.problemsSolved ? stats.problemsSolved : 0;
  }
});

document.getElementById("authenticate").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "getDataConfig" }).then((data) => {
    const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${
      data.REDIRECT_URL
    }&scope=${data.SCOPES.join(" ")}`;

    chrome.tabs.create({ url, active: true }, function () {});
  });
});

document.getElementById("hook-button").addEventListener("click", () => {
  const repositoryName = document.getElementById("repo-name").value;
  document.getElementById("repo-name-error").textContent = "";

  if (repositoryName) {
    chrome.storage.local.get(
      ["leetcode_tracker_token", "leetcode_tracker_username"],
      (result) => {
        if (result) {
          linkRepo(result, repositoryName);
        }
      }
    );
  } else {
    document.getElementById("repo-name-error").textContent =
      "Please enter a repository name";
  }
});

document.getElementById("unlink-button").addEventListener("click", () => {
  unlinkRepo();
});

async function linkRepo(storageInfo, repositoryName) {
  const token = storageInfo.leetcode_tracker_token;
  const username = storageInfo.leetcode_tracker_username;

  if (!repositoryName) {
    return;
  }

  const dataConfig = await chrome.runtime.sendMessage({
    type: "getDataConfig",
  });

  const repoResponse = await fetch(
    dataConfig.REPOSITORY_URL + username + "/" + repositoryName,
    {
      method: "GET",
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${token}`,
      },
    }
  );

  const result = await repoResponse.json();

  if (repoResponse.status !== 200) {
    document.getElementById("repo-name-error").textContent = result.message;
    return;
  }

  chrome.storage.local.set({ leetcode_tracker_mode: "commit" }, () => {});

  chrome.storage.local.set({ leetcode_tracker_repo: repositoryName }, () => {
    document.getElementById("hook-repo").style.display = "none";
    document.getElementById("authenticated").style.display = "block";
  });
}

function unlinkRepo() {
  chrome.storage.local.remove(
    ["leetcode_tracker_mode", "leetcode_tracker_repo"],
    () => {
      document.getElementById("authenticated").style.display = "none";
      document.getElementById("hook-repo").style.display = "block";
    }
  );
}

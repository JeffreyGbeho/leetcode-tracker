chrome.storage.local.get(["leetcode_tracker_token", "leetcode_tracker_username", "leetcode_tracker_mode", "leetcode_tracker_hook"], (result) => {
  if (!result.leetcode_tracker_token || !result.leetcode_tracker_username) {
    document.getElementById("authenticate").style.display = "block";
  } else if (!result.leetcode_tracker_hook || !result.leetcode_tracker_mode) {
    document.getElementById("hook-repo").style.display = "block";
  } else {
    document.getElementById("authenticated").style.display = "block";
  }
});

document.getElementById("authenticate").addEventListener("click", () => {
  fetch('./config.json').then(response => response.json()).then(data => {
    const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${data.REDIRECT_URL}&scope=${data.SCOPES.join(" ")}`;
  
    chrome.tabs.create({ url, active: true }, function () {});
  });
});

document.getElementById("hook-button").addEventListener("click", () => {
  const repositoryName = document.getElementById("repo-name").value;
  document.getElementById("repo-name-error").textContent = "";

  if (repositoryName) {
    chrome.storage.local.get(["leetcode_tracker_token", "leetcode_tracker_username"], (result) => {
      if (result) {
        linkRepo(result, repositoryName);
      }
    });
  } else {
    document.getElementById("repo-name-error").textContent = "Please enter a repository name";
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

  const configResponse = await fetch('./config.json');
  const dataConfig = await configResponse.json();

  const repoResponse = await fetch(dataConfig.REPOSITORY_URL + username + "/" + repositoryName, {
    method: "GET",
    headers: {
      ...dataConfig.HEADERS,
      "Authorization": `token ${token}`
    }
  });

  const result = await repoResponse.json();

  if (repoResponse.status !== 200) {
    document.getElementById("repo-name-error").textContent = result.message;
    return;
  }

  chrome.storage.local.set({leetcode_tracker_mode: 'commit'}, () => {});

  chrome.storage.local.set({leetcode_tracker_hook: result.html_url}, () => {
    document.getElementById("hook-repo").style.display = "none";
    document.getElementById("authenticated").style.display = "block";
  });
}

function unlinkRepo() {
  chrome.storage.local.remove(["leetcode_tracker_mode", "leetcode_tracker_hook"], () => {
    document.getElementById("authenticated").style.display = "none";
    document.getElementById("hook-repo").style.display = "block";
  });
}
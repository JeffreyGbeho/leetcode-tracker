const languageExtensions = {
  cpp: ".cpp",
  java: ".java",
  ython: ".py",
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
var problemName = "";

function getLanguageExtension() {
  const language = window.localStorage
    .getItem("global_lang")
    .replaceAll('"', "");

  if (language) {
    return languageExtensions[language];
  }

  return null;
}

function getDifficulty() {
  const easy = document.querySelector("div.text-olive");
  const medium = document.querySelector("div.text-yellow");
  const hard = document.querySelector("div.text-pink");

  if (easy) {
    return "easy";
  } else if (medium) {
    return "medium";
  } else if (hard) {
    return "hard";
  }

  return null;
}

function formatProblemName(problemName) {
  problemName = problemName.replace(".", "-").split(" ").join("");
  return problemName;
}

function getCodeFormatted() {
  let codeLines = document.querySelectorAll(".view-line");
  let codeFormatted = "";

  for (let i = 0; i < codeLines.length; i++) {
    codeFormatted += codeLines[i].textContent + "\n";
  }

  return codeFormatted;
}

function main() {
  let mainInterval = setInterval(() => {
    const buttonSubmit = document.querySelector(
      'button[data-e2e-locator="console-submit-button"]:not([data-state="closed"])'
    );

    // Problem Name
    const hrefSelector = window.location.pathname.replace("description/", "");
    const problemNameSelector = document.querySelector(
      "a[href='" + hrefSelector + "']"
    );
    if (problemNameSelector) {
      const problemSlug = formatProblemName(problemNameSelector.textContent);
      window.localStorage.setItem("global_problem_slug", problemSlug);
    }

    // Difficulty
    const difficulty = getDifficulty();
    if (difficulty) {
      window.localStorage.setItem("global_difficulty", difficulty);
    }

    // Description
    const problemDescription = document.querySelector(
      'div[data-track-load="description_content"]'
    );
    if (problemDescription) {
      window.localStorage.setItem(
        "global_description",
        problemDescription.textContent
      );
    }

    if (buttonSubmit) {
      clearInterval(mainInterval);
    } else {
      return;
    }

    // Click submit button
    buttonSubmit.addEventListener("click", () => {
      main();

      let interval = setInterval(() => {
        const accepted = document.querySelector(
          'span[data-e2e-locator="submission-result"]'
        );
        if (accepted && accepted.textContent === "Accepted") {
          clearInterval(interval);
          checkFileExistence();
        }
      }, 1000);
    });
  }, 1000);
}

function checkFileExistence() {
  chrome.storage.local.get(
    [
      "leetcode_tracker_repo",
      "leetcode_tracker_username",
      "leetcode_tracker_token",
    ],
    (result) => {
      if (
        result.leetcode_tracker_repo &&
        result.leetcode_tracker_username &&
        result.leetcode_tracker_token
      ) {
        chrome.runtime
          .sendMessage({ type: "getDataConfig" })
          .then((response) => {
            getRepository(response, result);
          });
      }
    }
  );
}

async function getRepository(dataConfig, result) {
  problemName = window.localStorage.getItem("global_problem_slug");

  const repoResponse = await fetch(
    dataConfig.REPOSITORY_URL +
      result.leetcode_tracker_username +
      "/" +
      result.leetcode_tracker_repo +
      "/contents/" +
      problemName +
      "/" +
      problemName +
      getLanguageExtension(),
    {
      method: "GET",
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${result.leetcode_tracker_token}`,
      },
    }
  );
  const isRepositoryExists = await repoResponse.json();

  if (repoResponse.status !== 200) {
    createFileGitRepository(dataConfig, result);
    return;
  } else {
    updateFileGitRepository(dataConfig, result, isRepositoryExists.sha);
  }
}

async function updateFileGitRepository(dataConfig, result, sha) {
  await fetch(
    dataConfig.REPOSITORY_URL +
      result.leetcode_tracker_username +
      "/" +
      result.leetcode_tracker_repo +
      "/contents/" +
      problemName +
      "/" +
      problemName +
      getLanguageExtension(),
    {
      method: "PUT",
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${result.leetcode_tracker_token}`,
      },
      body: JSON.stringify({
        message: "Update file " + new Date().toLocaleString(),
        content: btoa(getCodeFormatted()),
        sha: sha,
      }),
    }
  );
}

async function createFileGitRepository(dataConfig, result) {
  const repoResponse = await fetch(
    dataConfig.REPOSITORY_URL +
      result.leetcode_tracker_username +
      "/" +
      result.leetcode_tracker_repo +
      "/contents/" +
      problemName +
      "/" +
      problemName +
      getLanguageExtension(),
    {
      method: "PUT",
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${result.leetcode_tracker_token}`,
      },
      body: JSON.stringify({
        message: "Create file",
        content: btoa(getCodeFormatted()),
      }),
    }
  );

  await fetch(
    dataConfig.REPOSITORY_URL +
      result.leetcode_tracker_username +
      "/" +
      result.leetcode_tracker_repo +
      "/contents/" +
      problemName +
      "/README.md",
    {
      method: "PUT",
      headers: {
        ...dataConfig.HEADERS,
        Authorization: `token ${result.leetcode_tracker_token}`,
      },
      body: JSON.stringify({
        message: "Adding readme file",
        content: btoa(window.localStorage.getItem("global_description")),
      }),
    }
  );

  if (repoResponse.status === 201) {
    chrome.runtime.sendMessage({
      type: "updateDifficultyStats",
      difficulty: window.localStorage.getItem("global_difficulty"),
    });
  }
}

main();

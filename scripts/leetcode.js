// TODO: Fix timeout
// TODO: Refactor code

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

function main() {
  setTimeout(() => {
    const buttonSubmit = document.querySelector(
      'button[data-e2e-locator="console-submit-button"]'
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

    // Click submit button
    buttonSubmit.addEventListener("click", () => {
      setTimeout(() => {
        loader();
      }, 7000);
    });
  }, 3000);
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

function loader() {
  const accepted = document.querySelector(
    'span[data-e2e-locator="submission-result"]'
  );

  if (accepted && accepted.textContent === "Accepted") {
    checkFileExistence();
  }
}

function checkFileExistence() {
  console.log("check file existence");
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
        console.log("let's go");
        chrome.runtime
          .sendMessage({ type: "getDataConfig" })
          .then((response) => {
            console.log(response);
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
    console.log("file does not exist");
    createFileGitRepository(dataConfig, result);
    return;
  } else {
    console.log("file exists");
    updateFileGitRepository(dataConfig, result, isRepositoryExists.sha);
  }
}

function getCodeFormatted() {
  let codeLines = document.querySelectorAll(".view-line");
  let codeFormatted = "";
  for (let i = 0; i < codeLines.length; i++) {
    codeFormatted += codeLines[i].textContent + "\n";
  }

  return codeFormatted;
}

async function updateFileGitRepository(dataConfig, result, sha) {
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

  if (repoResponse.status === 201) {
    console.log("file created");
    chrome.runtime.sendMessage({
      type: "updateDifficultyStats",
      difficulty: window.localStorage.getItem("global_difficulty"),
    });
  }
}

main();

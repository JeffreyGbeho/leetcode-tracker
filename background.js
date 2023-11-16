fetch("./config.json")
  .then((response) => response.json())
  .then((data) => {
    chrome.runtime.onMessage.addListener(function (
      request,
      sender,
      sendResponse
    ) {
      if (request.type === "getDataConfig") {
        sendResponse(data);
      }
    });
  });

function handleMessage(request) {
  if (request) {
    chrome.storage.local.set(
      { leetcode_tracker_username: request.username },
      () => {}
    );

    chrome.storage.local.set(
      { leetcode_tracker_token: request.token },
      () => {}
    );
  }
}

chrome.runtime.onMessage.addListener(handleMessage);

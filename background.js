fetch('./config.json').then(response => response.json()).then(data => {
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.type === "getDataConfig") {
        sendResponse(data);
      }
    }
  );
});

function handleMessage(request, sender, sendResponse) {
  if (request) {
        chrome.storage.local.set(
          { leetcode_tracker_username: request.username }, () => {
            console.log("Username set to " + request.username);
          },
        );

        chrome.storage.local.set({ leetcode_tracker_token: request.token }, () => {
          console.log("Token set to " + request.token);
        });
    
        // TODO: Close the current tab
    }
}

chrome.runtime.onMessage.addListener(handleMessage);
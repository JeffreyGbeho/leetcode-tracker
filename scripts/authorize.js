let dataConfig = {};

/**
 * Get github's access token.
 * @param {*} code
 */
async function getAccessToken(code) {
  const response = await fetch(dataConfig.ACCESS_TOKEN_URL, {
    method: "POST",
    headers: dataConfig.HEADER,
    body: JSON.stringify({
      client_id: dataConfig.CLIENT_ID,
      client_secret: dataConfig.CLIENT_SECRET,
      code: code,
    }),
  });

  const data = await response.json();

  getUserInfo(data.access_token);
}

/**
 * Get github's user informations with the access token and save them in the local storage.
 * @param {*} accessToken
 */
async function getUserInfo(accessToken) {
  const response = await fetch(dataConfig.USER_INFO_URL, {
    method: "GET",
    headers: {
      ...dataConfig.HEADER,
      Authorization: `token ${accessToken}`,
    },
  });

  const data = await response.json();

  chrome.runtime.sendMessage({
    type: "saveUserInfos",
    token: accessToken,
    username: data.login,
  });
}

/**
 * Retrieve config file from the background script.
 */
if (window.location.host === "github.com") {
  const code = window.location.search.split("=")[1];

  chrome.runtime.sendMessage({ type: "getDataConfig" }).then((response) => {
    dataConfig = response;

    getAccessToken(code);
  });
}

document.getElementById("authenticate").addEventListener("click", () => {
  fetch('./config.json').then(response => response.json()).then(data => {
    const url = `${data.URL}?client_id=${data.CLIENT_ID}&redirect_uri${data.REDIRECT_URL}&scope=${data.SCOPES.join(" ")}`;
  
    chrome.tabs.create({ url, active: true }, function () {});
  });
}); 

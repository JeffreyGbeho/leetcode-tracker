<h1 align="center">
  <a href="https://chromewebstore.google.com/detail/leetcode-tracker/bnhnpmglielpbmnnhhbcfnljhijfppbm">Leetcode Tracker</a> - Automatically sync your leetcode submission to GitHub.
  <br>
  <br>
</h1>

<div align="center">
[![Chrome]([https://user-images.githubusercontent.com/53124886/111952712-34f12300-8aee-11eb-9fdd-ad579a1eb235.png](https://github.com/JeffreyGbeho/leetcode-tracker/assets/150350006/e509a587-65c6-4b7e-adaf-0e59c7b72a23))](https://chromewebstore.google.com/detail/leetcode-tracker/bnhnpmglielpbmnnhhbcfnljhijfppbm)
![111952712-34f12300-8aee-11eb-9fdd-ad579a1eb235](https://github.com/JeffreyGbeho/leetcode-tracker/assets/150350006/e509a587-65c6-4b7e-adaf-0e59c7b72a23)
</div>


## What is Leetcode Tracker?

<p>A chrome extension that automatically pushes your code to GitHub when you pass all tests on a <a href="http://leetcode.com/problems/">Leetcode problem</a>. </p>

## Why LeetHub?

<p> <strong>1.</strong> Recruiters <em>want</em> to see your contributions to the Open Source community, be it through side projects, solving algorithms/data-structures, or contributing to existing OS projects.<br>
As of now, GitHub is developers' #1 portfolio. LeetHub just makes it much easier (autonomous) to keep track of progress and contributions on the largest network of engineering community, GitHub.</p>

<p> <strong>2.</strong> There's no easy way of accessing your leetcode problems in one place! <br>
Moreover, pushing code manually to GitHub from Leetcode is very time consuming. So, why not just automate it entirely without spending a SINGLE additional second on it? </p>

## How does LeetHub work?

<ol>
  <li>After installation, launch leetcode tracker.</li>
  <li>Click on "Authenticate" button to automatically link your github account with the extension.</li>
  <li>Setup an existing repository.</li>
  <li>Begin Leetcoding! To view your progress, simply click on the extension!</li>
</ol>

## Why did I build LeetHub?

<p>
The coding interview is arguably the most important part of your interview process, given you get the interview first. As someone who's received multiple internship offers from Fortune 100 companies, getting the interview in the first place is not easy!<br>
And that's what LeetHub is supposed to do: indirectly improving your coding skills while improving your portfolio to ACE that interview at <em>insert_name_here</em>! <br>
There were many Chrome extensions to automatically synchronize LeetCode code with GitHub, but none of them was up-to-date to work with the new LeetCode interface.
</p>

# How to set up LeetHub for local development?

<ol>
  <li>Fork this repo and clone to your local machine</li>
  <li>Create new file config.js in cloned folder</li>
  <li>Copy/paste the following code in the new file and patch CLIENT_SECRET and CLIENT_ID keys.</li>
  <code>
export const config = {
  URL: "https://github.com/login/oauth/authorize",
  ACCESS_TOKEN_URL: "https://github.com/login/oauth/access_token",
  REDIRECT_URL: " https://github.com/",
  REPOSITORY_URL: "https://api.github.com/repos/",
  USER_INFO_URL: "https://api.github.com/user",
  CLIENT_SECRET: "YOUR_CLIENT_SECRET_KEY",
  CLIENT_ID: "YOUR_CLIENT_ID",
  SCOPES: ["repo"],
  HEADER: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
};
</code>
<li>Go to <a href="chrome://extensions">chrome://extensions</a> </li>
<li>Enable <a href="https://www.mstoic.com/enable-developer-mode-in-chrome/">Developer mode</a> by toggling the switch on top right corner</li>
<li>Click 'Load unpacked'</li>
<li>Select the entire LeetHub folder</li>
</ol>

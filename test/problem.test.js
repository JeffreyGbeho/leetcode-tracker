import { test } from "node:test";
import assert from "node:assert/strict";
import Problem from "../scripts/models/problem.js";

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeMutationObserver.instances.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this);
  }
}
FakeMutationObserver.instances = [];

class FakeBody {
  constructor() {
    this.children = [];
  }
  appendChild(el) {
    this.children.push(el);
  }
  removeChild(el) {
    this.children = this.children.filter((c) => c !== el);
  }
  contains(el) {
    return this.children.includes(el);
  }
}

function makeIframeDocument({ slug, difficulty, description, problemUrl }) {
  return {
    querySelector(selector) {
      if (selector === `a[href='${problemUrl}']`) {
        return slug ? { textContent: slug } : null;
      }
      if (selector.startsWith("div.text-difficulty-")) {
        return selector === `div.text-difficulty-${difficulty}` ? {} : null;
      }
      if (selector.includes("description_content")) {
        return description ? { textContent: description } : null;
      }
      return null;
    },
  };
}

function setupGlobals(href) {
  FakeMutationObserver.instances = [];
  global.MutationObserver = FakeMutationObserver;
  global.window = { location: { href } };
  const body = new FakeBody();
  global.document = {
    body,
    createElement: () => ({ style: {} }),
  };
  return body;
}

test("loadProblemFromDOM resets slug/difficulty/description synchronously, before extraction resolves", () => {
  const problem = new Problem();
  setupGlobals("https://leetcode.com/problems/two-sum/");

  problem.slug = "stale-slug";
  problem.difficulty = "hard";
  problem.description = "stale description";

  problem.loadProblemFromDOM();

  assert.equal(problem.slug, "", "slug must be cleared immediately, not left stale");
  assert.equal(problem.difficulty, "");
  assert.equal(problem.description, "");
});

test("loadProblemFromDOM resolves once extraction completes, with the extracted metadata", async () => {
  const problem = new Problem();
  const body = setupGlobals("https://leetcode.com/problems/two-sum/");

  const load = problem.loadProblemFromDOM();
  const iframe = body.children[0];
  assert.ok(iframe, "an iframe should be appended to extract problem info");

  iframe.contentDocument = makeIframeDocument({
    slug: "Two-Sum",
    difficulty: "easy",
    description: "Given an array of integers...",
    problemUrl: problem.problemUrl,
  });
  iframe.onload();
  FakeMutationObserver.instances[0].trigger();

  await load;

  assert.equal(problem.slug, "Two-Sum");
  assert.equal(problem.difficulty, "easy");
  assert.equal(problem.description, "Given an array of integers...");
  assert.equal(body.contains(iframe), false, "iframe must be cleaned up after extraction");
});

test("a stale extraction cannot overwrite a newer navigation's metadata (regression for issue #29)", async () => {
  const problem = new Problem();
  const body = setupGlobals("https://leetcode.com/problems/two-sum/");

  // First navigation starts extracting: its iframe loads and its
  // MutationObserver is armed, but the page content it's watching for is
  // slow to render (e.g. a heavier problem page).
  const firstLoad = problem.loadProblemFromDOM();
  const firstIframe = body.children[0];
  firstIframe.contentDocument = makeIframeDocument({
    slug: "Two-Sum",
    difficulty: "easy",
    description: "first description",
    problemUrl: problem.problemUrl,
  });
  firstIframe.onload(); // registers FakeMutationObserver.instances[0]

  // User navigates again before the first extraction's content ever rendered.
  global.window.location.href = "https://leetcode.com/problems/add-two-numbers/";
  const secondLoad = problem.loadProblemFromDOM();
  const secondIframe = body.children.find((el) => el !== firstIframe);
  assert.ok(secondIframe, "a second iframe should be created for the newer navigation");
  secondIframe.contentDocument = makeIframeDocument({
    slug: "Add-Two-Numbers",
    difficulty: "medium",
    description: "second description",
    problemUrl: problem.problemUrl,
  });
  secondIframe.onload(); // registers FakeMutationObserver.instances[1]

  // The second (newer) extraction's content renders first.
  FakeMutationObserver.instances[1].trigger();
  await secondLoad;

  assert.equal(problem.slug, "Add-Two-Numbers");
  assert.equal(problem.difficulty, "medium");

  // The stale first extraction's content only renders now, belatedly.
  FakeMutationObserver.instances[0].trigger();
  await firstLoad;

  // It must resolve (no dangling promise/observer) but must NOT clobber the
  // newer problem's metadata with the older problem's data.
  assert.equal(
    problem.slug,
    "Add-Two-Numbers",
    "a slow, superseded extraction must not overwrite the current problem's slug"
  );
  assert.equal(problem.difficulty, "medium");
  assert.equal(FakeMutationObserver.instances[0].disconnected, true);
});

test("extraction gives up after the timeout instead of hanging forever", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const problem = new Problem();
  const body = setupGlobals("https://leetcode.com/problems/two-sum/");

  const load = problem.loadProblemFromDOM();
  const iframe = body.children[0];
  iframe.contentDocument = makeIframeDocument({}); // page never renders the expected data
  iframe.onload();

  t.mock.timers.tick(3000);
  await load;

  assert.equal(problem.slug, "", "slug stays empty rather than reusing stale data");
  assert.equal(body.contains(iframe), false, "iframe must still be cleaned up on timeout");
});

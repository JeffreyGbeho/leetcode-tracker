import { test } from "node:test";
import assert from "node:assert/strict";
import RouteService from "../scripts/services/route-service.js";

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

function setupGlobals(initialPathname) {
  FakeMutationObserver.instances = [];
  global.MutationObserver = FakeMutationObserver;
  global.document = { body: {} };
  global.location = { pathname: initialPathname };
}

test("RouteService keeps detecting navigations after the first route change (regression for issue #29)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setupGlobals("/problems/two-sum/");

  const calls = [];
  new RouteService(() => calls.push(global.location.pathname));

  const observer = FakeMutationObserver.instances[0];
  assert.ok(observer, "RouteService should register a MutationObserver");

  const navigate = (pathname) => {
    global.location.pathname = pathname;
    observer.trigger();
    t.mock.timers.tick(1000); // clear the debounce window
  };

  navigate("/problems/add-two-numbers/");
  navigate("/problems/longest-substring-without-repeating-characters/");
  navigate("/problems/median-of-two-sorted-arrays/");
  navigate("/problems/zigzag-conversion/");

  assert.equal(
    calls.length,
    4,
    "onRouteChange must fire for every navigation, not just the first one " +
      "(the old code called observer.disconnect() and never reconnected, " +
      "so only the first navigation was ever detected)"
  );
  assert.equal(
    observer.disconnected,
    false,
    "the observer must stay connected for the lifetime of the page"
  );
});

test("RouteService collapses a burst of mutations from one navigation into a single callback", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setupGlobals("/problems/two-sum/");

  const calls = [];
  new RouteService(() => calls.push(true));
  const observer = FakeMutationObserver.instances[0];

  global.location.pathname = "/problems/add-two-numbers/";
  observer.trigger();
  t.mock.timers.tick(200);
  observer.trigger(); // slug unchanged since first trigger, should be a no-op
  t.mock.timers.tick(200);
  observer.trigger(); // still unchanged

  assert.equal(calls.length, 0, "should not fire before the debounce window elapses");

  t.mock.timers.tick(1000);
  assert.equal(calls.length, 1, "a burst of mutations for one navigation should yield exactly one callback");
});

test("RouteService ignores DOM mutations that are not route changes", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  setupGlobals("/problems/two-sum/");

  const calls = [];
  new RouteService(() => calls.push(true));
  const observer = FakeMutationObserver.instances[0];

  observer.trigger();
  observer.trigger();
  t.mock.timers.tick(2000);

  assert.equal(calls.length, 0, "unrelated DOM mutations must not trigger onRouteChange");
});

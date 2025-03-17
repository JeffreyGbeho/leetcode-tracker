/**
 * Service class that monitors URL changes on LeetCode pages
 * Detects when a user navigates between different problem pages or tabs
 */
export default class RouteService {
  constructor(onRouteChange) {
    this.problemSlug = this.extractProblemSlugFromUrl(location.pathname);
    this.onRouteChange = onRouteChange;
    this.observeUrlChanges();
  }

  observeUrlChanges() {
    const observer = new MutationObserver(() => {
      if (
        this.problemSlug !== this.extractProblemSlugFromUrl(location.pathname)
      ) {
        observer.disconnect();
        this.problemSlug = this.extractProblemSlugFromUrl(location.pathname);

        setTimeout(() => {
          this.onRouteChange();
        }, 1000);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });
  }

  extractProblemSlugFromUrl(pathname) {
    const match = pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Service class that monitors URL changes on LeetCode pages
 * Detects when a user navigates between different problem pages or tabs
 */
export default class RouteService {
  constructor(onRouteChange) {
    this.problemSlug = this.extractProblemSlugFromUrl(location.pathname);
    this.onRouteChange = onRouteChange;
    this.routeChangeTimeout = null;
    this.observeUrlChanges();
  }

  observeUrlChanges() {
    const observer = new MutationObserver(() => {
      const currentSlug = this.extractProblemSlugFromUrl(location.pathname);

      if (this.problemSlug !== currentSlug) {
        this.problemSlug = currentSlug;

        if (this.routeChangeTimeout) {
          clearTimeout(this.routeChangeTimeout);
        }

        this.routeChangeTimeout = setTimeout(() => {
          this.routeChangeTimeout = null;
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

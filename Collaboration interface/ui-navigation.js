const PREFETCHED = new Set();

function normalizeHref(rawHref) {
  if (!rawHref) return "";
  try {
    const url = new URL(rawHref, window.location.href);
    return url.href;
  } catch (_) {
    return "";
  }
}

function canNavigateWithTransition(anchor, event) {
  if (!anchor) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = normalizeHref(anchor.getAttribute("href"));
  if (!href) return false;

  const target = new URL(href);
  if (target.origin !== window.location.origin) return false;
  if (!target.pathname.endsWith(".html")) return false;
  if (target.hash && target.pathname === window.location.pathname) return false;
  if (target.pathname === window.location.pathname && !target.search && !target.hash) return false;

  return true;
}

function prefetchPage(href) {
  const normalized = normalizeHref(href);
  if (!normalized || PREFETCHED.has(normalized)) return;

  const url = new URL(normalized);
  if (url.origin !== window.location.origin) return;
  if (!url.pathname.endsWith(".html")) return;

  PREFETCHED.add(normalized);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "document";
  link.href = normalized;
  document.head.appendChild(link);
}

function prefetchVisibleLinks() {
  document.querySelectorAll('a[href$=".html"]').forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href) prefetchPage(href);
  });
}

function transitionNavigate(href) {
  if (document.body.classList.contains("page-transition-out")) {
    window.location.href = href;
    return;
  }

  document.body.classList.add("page-transition-out");
  window.setTimeout(() => {
    window.location.href = href;
  }, 180);
}

export function initNavigationEnhancements() {
  if (window.__hrmsNavEnhanceReady) return;
  window.__hrmsNavEnhanceReady = true;

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
    if (!canNavigateWithTransition(anchor, event)) return;
    event.preventDefault();
    const href = normalizeHref(anchor.getAttribute("href"));
    if (!href) return;
    transitionNavigate(href);
  });

  const eagerPrefetch = (event) => {
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    prefetchPage(anchor.getAttribute("href"));
  };

  document.addEventListener("mouseenter", eagerPrefetch, { capture: true });
  document.addEventListener("touchstart", eagerPrefetch, { capture: true, passive: true });

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => prefetchVisibleLinks(), { timeout: 1200 });
  } else {
    window.setTimeout(prefetchVisibleLinks, 500);
  }
}

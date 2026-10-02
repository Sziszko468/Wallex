// Runs before first paint (loaded synchronously from <head>): applies the saved theme so a
// user who picked Light/Dark never sees a flash of the other one while the app boots.
// Kept as an external file because the production CSP (script-src 'self') forbids inline scripts.
// "System" needs no attribute at all: the stylesheet follows prefers-color-scheme by itself.
// The storage key and values must match src/hooks/useTheme.tsx.
(function () {
  try {
    var saved = localStorage.getItem("wallex-theme");
    var root = document.documentElement;
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

    var dark =
      saved === "dark" ||
      (saved !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#111412" : "#f4f2ea");
  } catch {
    // Storage can be blocked (private mode, strict settings): fall back to following the system.
  }
})();

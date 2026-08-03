export function createRouter({ onRoute }) {
  function parseHash() {
    const h = window.location.hash || "#/";
    const path = h.replace(/^#/, "");
    return path.startsWith("/") ? path : `/${path}`;
  }

  function setActive(path) {
    document.querySelectorAll(".navItem").forEach((a) => {
      const r = a.getAttribute("data-route");
      const isStock = path.startsWith("/stock/");
      const active = (isStock && r === "/") ? false : (r === path);
      if ((path === "/" && r === "/") || active) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  function route() {
    const path = parseHash();
    if (path.startsWith("/stock/")) {
      const symbol = path.split("/")[2] || "NIFTY50";
      onRoute("/stock/" + symbol, { symbol });
      setActive("/"); // keep nav neutral for stock drilldown
      return;
    }
    onRoute(path, {});
    setActive(path);
  }

  return {
    start() {
      window.addEventListener("hashchange", route);
      route();
    },
  };
}

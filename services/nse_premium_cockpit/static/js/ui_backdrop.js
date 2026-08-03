export function setBackdropAccent(accent) {
  const el = document.getElementById("liquidBackdrop");
  if (!el) return;
  el.setAttribute("data-accent", accent === "green" ? "green" : "red");
}

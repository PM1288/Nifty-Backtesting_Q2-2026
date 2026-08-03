let raf = null;

export function initDisclaimerMarquee() {
  const track = document.getElementById("disclaimerTrack");
  if (!track) return;
  let x = 0;
  const speed = 28; // px/s
  let last = performance.now();

  function step(now) {
    const dt = (now - last) / 1000;
    last = now;
    x -= speed * dt;
    const w = track.getBoundingClientRect().width / 2;
    if (w > 0 && Math.abs(x) >= w) x = 0;
    track.style.transform = `translate3d(${x}px,0,0)`;
    raf = requestAnimationFrame(step);
  }
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(step);
}

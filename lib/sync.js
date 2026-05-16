// Wires scroll-sync across an array of Playwright Page objects.
// Each page reports its scroll ratio [0,1] via an exposed Node function,
// which broadcasts a proportional instant scroll to every other page.
export async function wireSync(pages) {
  let broadcasting = false;

  for (const page of pages) {
    await page.exposeFunction('reportScroll', async (ratio) => {
      if (broadcasting) return;
      broadcasting = true;
      try {
        await Promise.all(
          pages
            .filter((p) => p !== page)
            .map((p) =>
              p.evaluate((r) => {
                const el = document.documentElement;
                // Flag suppresses this page's scroll listener for 50ms so its
                // own event doesn't echo back and interrupt the originating page.
                window.__syncScrolling = true;
                setTimeout(() => { window.__syncScrolling = false; }, 50);
                // Override CSS scroll-behavior: smooth so this lands instantly.
                const prev = el.style.scrollBehavior;
                el.style.scrollBehavior = 'auto';
                window.scrollTo({ top: (el.scrollHeight - window.innerHeight) * r });
                el.style.scrollBehavior = prev;
              }, ratio).catch(() => {})
            )
        );
      } finally {
        broadcasting = false;
      }
    });

    await page.addInitScript(() => {
      let lastRatio = -1;
      window.addEventListener('scroll', () => {
        if (window.__syncScrolling) return; // programmatic scroll — don't echo back
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? window.scrollY / max : 0;
        if (Math.abs(ratio - lastRatio) < 0.001) return;
        lastRatio = ratio;
        window.reportScroll(ratio);
      }, { passive: true });
    });
  }
}

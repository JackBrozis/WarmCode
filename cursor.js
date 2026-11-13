// WarmCode page navigation — isolated from the site's existing scripts.
// Wheel up moves right; wheel down moves left. Other site files stay untouched.
(() => {
  const viewport = document.querySelector('#viewport');
  if (!viewport) return;

  const panels = [...viewport.querySelectorAll('.panel')];
  if (!panels.length) return;

  const topic = document.querySelector('#topic');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  let targetIndex = Math.max(0, panels.findIndex(panel =>
    `#${panel.id}` === window.location.hash
  ));
  if (window.location.hash && targetIndex === 0 &&
      `#${panels[0].id}` !== window.location.hash) {
    targetIndex = clamp(Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1)), 0, panels.length - 1);
  } else if (!window.location.hash) {
    targetIndex = clamp(Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1)), 0, panels.length - 1);
  }

  let targetScrollLeft = viewport.scrollLeft;
  let animationFrame = 0;
  let previousFrameTime = 0;
  let scrollVelocity = 0;
  let lastWheelTime = 0;
  let scrollSyncTimer = 0;

  function goTo(index) {
    targetIndex = clamp(index, 0, panels.length - 1);
    const panel = panels[targetIndex];
    if (!panel) return;

    targetScrollLeft = panel.offsetLeft;
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    viewport.scrollTo({
      left: targetScrollLeft,
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });

    if (window.location.hash !== `#${panel.id}`) {
      history.replaceState(null, '', `#${panel.id}`);
    }
  }

  function animateWheelScroll(now) {
    if (!previousFrameTime) previousFrameTime = now;
    // Use elapsed time rather than a per-frame percentage so motion stays
    // consistent on 60 Hz, 144 Hz and 360 Hz displays.
    const dt = Math.min((now - previousFrameTime) / 1000, 0.032);
    previousFrameTime = now;

    const current = viewport.scrollLeft;
    const difference = targetScrollLeft - current;

    // A damped spring follows the wheel target continuously. It has no
    // per-notch pause or panel snap, and naturally eases to a quiet stop.
    const stiffness = 260;
    const damping = 32;
    const acceleration = difference * stiffness - scrollVelocity * damping;
    scrollVelocity += acceleration * dt;
    viewport.scrollLeft = current + scrollVelocity * dt;

    if (Math.abs(difference) < 0.5 && Math.abs(scrollVelocity) < 8) {
      viewport.scrollLeft = targetScrollLeft;
      scrollVelocity = 0;
      previousFrameTime = 0;
      animationFrame = 0;
      return;
    }

    animationFrame = window.requestAnimationFrame(animateWheelScroll);
  }

  // Keep our target in sync with navigation links and any native scroll.
  viewport.addEventListener('scroll', () => {
    window.clearTimeout(scrollSyncTimer);
    scrollSyncTimer = window.setTimeout(() => {
      targetIndex = clamp(
        Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1)),
        0,
        panels.length - 1
      );
      if (!animationFrame && performance.now() - lastWheelTime > 180) {
        targetScrollLeft = viewport.scrollLeft;
      }
    }, 180);
  }, { passive: true });

  // Wheel movement is proportional: every notch moves the horizontal page
  // a little farther, instead of jumping directly to the next panel.
  viewport.addEventListener('wheel', event => {
    if (event.ctrlKey || event.shiftKey) return;
    if (event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;

    const horizontalDominant = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const rawDelta = horizontalDominant ? event.deltaX : -event.deltaY;
    if (!rawDelta) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const unit = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? viewport.clientWidth
        : 1;
    const movement = rawDelta * unit * 1.8;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

    // Disable CSS snap while using the wheel so the position stays exactly
    // where the accumulated wheel distance takes it.
    viewport.style.scrollSnapType = 'none';
    targetScrollLeft = clamp(targetScrollLeft + movement, 0, maxScroll);
    lastWheelTime = performance.now();

    if (!animationFrame) {
      previousFrameTime = 0;
      animationFrame = window.requestAnimationFrame(animateWheelScroll);
    }
  }, { passive: false, capture: true });

  // Once a support topic is chosen, return keyboard focus to the page so
  // subsequent arrow presses navigate sections instead of cycling options.
  if (topic) {
    topic.addEventListener('change', () => {
      window.requestAnimationFrame(() => {
        topic.blur();
        viewport.focus({ preventScroll: true });
      });
    });
  }

  // Capture arrow keys before the existing handler to avoid duplicate moves.
  document.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const active = document.activeElement;
    const isTyping = active && (
      active.matches('input, textarea, select, button') ||
      active.isContentEditable
    );
    if (isTyping) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    goTo(targetIndex + (event.key === 'ArrowRight' ? 1 : -1));
    viewport.focus({ preventScroll: true });
  }, true);
})();

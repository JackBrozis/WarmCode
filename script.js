const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const viewport = $("#viewport");
const panels = $$(".panel");
const navLinks = $$(".navigation a");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const mobileQuery = matchMedia("(max-width: 720px)");

let reducedMotion = motionPreference.matches;
let motionPaused = reducedMotion;
let activeIndex = -1;
let adminSelected = false;
let toastTimeout;

document.body.classList.toggle("reduce-motion", reducedMotion);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 5500);
}

function scrollBehavior() {
  return motionPaused || reducedMotion ? "auto" : "smooth";
}

function navigate(index, focusPanel = false) {
  const nextIndex = Math.max(0, Math.min(panels.length - 1, index));

  viewport.scrollTo({
    left: panels[nextIndex].offsetLeft,
    behavior: scrollBehavior()
  });

  history.replaceState(null, "", `#${panels[nextIndex].id}`);

  if (focusPanel) {
    panels[nextIndex].setAttribute("tabindex", "-1");
    panels[nextIndex].focus({ preventScroll: true });
  }
}

function updateNavigation() {
  const width = Math.max(viewport.clientWidth, 1);
  const position = viewport.scrollLeft / width;
  const index = Math.max(0, Math.min(3, Math.round(position)));

  $("#meter-fill").style.transform =
    `scaleX(${Math.min(1, Math.max(.25, (position + 1) / 4))})`;

  if (index === activeIndex) return;

  activeIndex = index;
  $("#page-number").textContent = String(index + 1).padStart(2, "0");

  panels.forEach((panel, i) => {
    panel.classList.toggle("active", i === index);
  });

  navLinks.forEach((link, i) => {
    if (i === index) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

viewport.addEventListener("scroll", updateNavigation, { passive: true });

$$('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = panels.findIndex(
      (panel) => `#${panel.id}` === link.getAttribute("href")
    );

    if (target === -1) return;
    event.preventDefault();
    navigate(target, true);
  });
});

// As requested: wheel UP advances right; wheel DOWN returns left.
// Trackpads with horizontal gestures keep their native direction.
viewport.addEventListener("wheel", (event) => {
  if (event.ctrlKey || mobileQuery.matches) return;
  if (event.target.closest("input, textarea, select")) return;

  const panel = event.target.closest(".panel");

  // Let shorter windows scroll vertically within a section first.
  if (panel && panel.scrollHeight > panel.clientHeight + 4) {
    const canScrollDown =
      event.deltaY > 0 &&
      panel.scrollTop + panel.clientHeight < panel.scrollHeight - 2;

    const canScrollUp = event.deltaY < 0 && panel.scrollTop > 2;

    if (canScrollDown || canScrollUp) return;
  }

  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
  const unit = event.deltaMode === 1
    ? 18
    : event.deltaMode === 2
      ? viewport.clientWidth
      : 1;

  const delta = horizontal ? event.deltaX : -event.deltaY;

  event.preventDefault();
  viewport.scrollBy({
    left: delta * unit * (horizontal ? 1 : 2.3),
    behavior: scrollBehavior()
  });
}, { passive: false });

document.addEventListener("keydown", (event) => {
  if (
    event.target.closest("input, textarea, select, button") ||
    event.target.isContentEditable ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    navigate(activeIndex + 1, true);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(activeIndex - 1, true);
  }
});

function updateHint() {
  $("#scroll-hint").textContent = mobileQuery.matches
    ? "SWIPE LEFT TO EXPLORE →"
    : "SCROLL UP TO EXPLORE →";
}

mobileQuery.addEventListener("change", updateHint);
updateHint();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    viewport.scrollTo({
      left: panels[Math.max(0, activeIndex)].offsetLeft,
      behavior: "auto"
    });
    updateNavigation();
  }, 120);
});

const initialPanel = panels.findIndex(
  (panel) => `#${panel.id}` === location.hash
);

if (initialPanel >= 0) {
  viewport.scrollLeft = panels[initialPanel].offsetLeft;
}
updateNavigation();

// Animated design counters. These describe site features, not user metrics.
const counterStart = performance.now();

function countUp(now) {
  const progress = reducedMotion
    ? 1
    : Math.min((now - counterStart) / 1900, 1);

  const eased = 1 - Math.pow(1 - progress, 3);

  $$("[data-count]").forEach((element) => {
    element.textContent = Math.round(Number(element.dataset.count) * eased);
  });

  if (progress < 1) requestAnimationFrame(countUp);
}
requestAnimationFrame(countUp);

// Motion controls.
const motionButton = $("#motion-toggle");

function syncMotionButton() {
  motionButton.textContent = motionPaused ? "Resume motion" : "Pause motion";
  motionButton.setAttribute("aria-pressed", String(motionPaused));
  document.body.classList.toggle("paused", motionPaused);
}

motionButton.addEventListener("click", () => {
  motionPaused = !motionPaused;
  syncMotionButton();
});

motionPreference.addEventListener("change", (event) => {
  reducedMotion = event.matches;
  motionPaused = reducedMotion;
  document.body.classList.toggle("reduce-motion", reducedMotion);
  syncMotionButton();
});
syncMotionButton();

// Administrator request reveal.
const topic = $("#topic");
const username = $("#username");
const adminFields = $("#admin-fields");

function updateTopic() {
  adminSelected = topic.value === "Administrator request";

  document.body.classList.toggle("admin-mode", adminSelected);

  adminFields.inert = !adminSelected;
  username.disabled = !adminSelected;
  username.required = adminSelected;

  if (!adminSelected) username.value = "";
}

topic.addEventListener("change", updateTopic);
updateTopic();

// Support form.
const form = $("#support-form");
const formStatus = $("#form-status");
const sendButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const data = new FormData(form);
  if (data.get("_honey")) return;

  const message = String(data.get("message") || "").trim();
  const requestedUsername = String(
    data.get("warmcode_username") || ""
  ).trim();

  if (message.length < 10) {
    formStatus.classList.add("error");
    formStatus.textContent = "Please write at least 10 characters.";
    return;
  }

  if (adminSelected && requestedUsername.length < 2) {
    formStatus.classList.add("error");
    formStatus.textContent = "Please enter your exact WarmCode username.";
    username.focus();
    return;
  }

  data.set("message", message);
  if (adminSelected) data.set("warmcode_username", requestedUsername);
  data.set("_subject", `WarmCode — ${topic.value}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  sendButton.disabled = true;
  sendButton.querySelector("span").textContent = "Sending...";
  formStatus.classList.remove("error");
  formStatus.textContent = "Connecting to the message service…";

  try {
    const response = await fetch(
      "https://formsubmit.co/ajax/varlan8@gmail.com",
      {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
        signal: controller.signal
      }
    );

    const result = await response.json();
    const accepted = result.success === true || result.success === "true";

    if (!response.ok || !accepted) {
      throw new Error(
        result.message || "The message service did not accept this request."
      );
    }

    // Acceptance by the provider is not proof of inbox delivery.
    formStatus.textContent =
      result.message ||
      "The message service accepted your request. If this is the first " +
      "submission, the site owner must activate the form by email.";

    showToast("Request accepted by the message service.");
    form.reset();
    updateTopic();
  } catch (error) {
    formStatus.classList.add("error");
    formStatus.textContent = error.name === "AbortError"
      ? "The request timed out; delivery is unconfirmed. " +
        "You can email varlan8@gmail.com directly."
      : `${error.message} You can also email varlan8@gmail.com directly.`;
  } finally {
    clearTimeout(timeout);
    sendButton.disabled = false;
    sendButton.querySelector("span").textContent = "Send message";
  }
});

// Check the installer before starting a download.
// The anchor still works natively if JavaScript is unavailable.
$(".download-button").addEventListener("click", async (event) => {
  event.preventDefault();
  const link = event.currentTarget;
  const url = new URL(link.getAttribute("href"), location.href);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || contentType.includes("text/html")) {
      throw new Error("Installer unavailable");
    }

    const download = document.createElement("a");
    download.href = url.href;
    download.download = "WarmCode.exe";
    document.body.appendChild(download);
    download.click();
    download.remove();

    showToast("Download requested. Check your browser’s downloads.");
  } catch {
    showToast(
      "Installer unavailable. Put WarmCode.exe beside index.html " +
      "and serve this folder through a web server."
    );
  }
});

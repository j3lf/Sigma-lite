(() => {
  if (window.JelloFullscreen) return;
  const preference = "jelloFullscreenEnabled";
  const selector = "#quickFullscreen, #fullScreenToggle";
  let enabled = localStorage.getItem(preference) === "true";
  let requesting = false;

  function updateControls() {
    document.querySelectorAll(selector).forEach(input => {
      input.checked = enabled;
      input.title = enabled
        ? "Fullscreen is enabled. After a browser exit, click the page background or press a key to enter again."
        : "Enable fullscreen";
    });
  }

  async function enterFullscreen() {
    if (!enabled || requesting || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    requesting = true;
    try {
      await document.documentElement.requestFullscreen();
      if (!enabled && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Browser exits and lost user activation require a later user gesture.
    } finally {
      requesting = false;
      updateControls();
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    localStorage.setItem(preference, String(enabled));
    updateControls();
    if (enabled) enterFullscreen();
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  document.querySelectorAll(selector).forEach(input => {
    input.addEventListener("change", () => setEnabled(input.checked));
  });

  function restoreFullscreen(event) {
    if (!enabled || !event.isTrusted || document.visibilityState !== "visible") return;
    if (event.type === "keydown" &&
        (event.key === "Escape" || event.key === "F11" || event.repeat || event.ctrlKey || event.metaKey || event.altKey)) return;
    const target = event.target;
    // Leave user activation available for launchers, file pickers and playback.
    if (target instanceof Element &&
        target.closest("a, button, input, select, textarea, label, [contenteditable]")) return;
    enterFullscreen();
  }

  document.addEventListener("click", restoreFullscreen, true);
  document.addEventListener("keydown", restoreFullscreen, true);
  document.addEventListener("fullscreenchange", updateControls);
  window.addEventListener("storage", event => {
    if (event.key !== preference && event.key !== null) return;
    enabled = localStorage.getItem(preference) === "true";
    updateControls();
    if (!enabled && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  window.JelloFullscreen = { setEnabled, isEnabled: () => enabled };
  updateControls();
  if (enabled && navigator.userActivation?.isActive) enterFullscreen();
})();

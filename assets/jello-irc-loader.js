(() => {
  if (window.JelloIRC || document.querySelector("script[data-jello-irc-loader]")) return;
  const base = document.currentScript.src;
  if (typeof loadJelloFirebase !== "function") {
    const firebase = document.createElement("script");
    firebase.src = new URL("jello-firebase.js", base).href;
    firebase.async = false;
    document.head.appendChild(firebase);
  }
  const script = document.createElement("script");
  script.async = false;
  script.src = new URL("jello-irc.js", base).href;
  script.dataset.jelloIrcLoader = "";
  document.head.appendChild(script);
})();

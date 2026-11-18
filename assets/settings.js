// Sigma Jello site-wide settings

// Keep chat and presence active across the main pages and game players.
{
    const ircPages = [
        "", "index.html", "games.html", "settings.html", "changelogs.html", "jelloportal.html", "music.html",
        "hollow-vale.html", "hollow-updated.html", "flash.html"
    ];
    const page = location.pathname.split("/").pop().toLowerCase();
    if (ircPages.includes(page) && !document.querySelector("script[data-jello-irc-bootstrap], script[data-jello-irc-loader]")) {
        const script = document.createElement("script");
        script.async = false;
        script.src = new URL("jello-irc-loader.js", document.currentScript.src).href;
        script.dataset.jelloIrcBootstrap = "";
        document.head.appendChild(script);
    }
    const mainPages = ["", "index.html", "games.html", "settings.html", "changelogs.html", "jelloportal.html", "music.html"];
    if (mainPages.includes(page) && !document.querySelector("script[data-jello-fullscreen]")) {
        const script = document.createElement("script");
        script.src = new URL("fullscreen.js", document.currentScript.src).href;
        script.dataset.jelloFullscreen = "";
        document.head.appendChild(script);
    }
}

function enableSavedNoTabClose() {
    window.onbeforeunload = function(event) {
        event.preventDefault();
        event.returnValue = "";
        return "";
    };
}

function navigateWithinJello(pagePath, event) {
    if (event) {
        if (event.defaultPrevented || event.button !== 0 ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
        }
        event.preventDefault();
    }

    withoutNoTabClose(() => window.location.assign(pagePath));
}

function withoutNoTabClose(navigate) {
    const previousHandler = window.onbeforeunload;
    const restore = () => {
        window.onbeforeunload = previousHandler;
    };
    window.onbeforeunload = null;
    window.addEventListener("pageshow", restore, { once: true });
    try {
        navigate();
    } catch (error) {
        window.removeEventListener("pageshow", restore);
        restore();
        throw error;
    }
}

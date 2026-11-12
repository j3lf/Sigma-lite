function applyLauncherTabSettings(tabDocument) {
    const driveIcon = "https://ssl.gstatic.com/docs/doclist/images/infinite_arrow_favicon_5.ico";
    const tabIcon = localStorage.getItem("tabIcon");
    tabDocument.title = localStorage.getItem("tabName") || "about:blank";
    tabDocument.head.querySelectorAll('link[rel~="icon"]').forEach(icon => icon.remove());

    if (tabIcon === "drive" || tabIcon === driveIcon) {
        const icon = tabDocument.createElement("link");
        icon.rel = "icon";
        icon.href = driveIcon;
        tabDocument.head.appendChild(icon);
    }
}

function openLauncherTab(pagePath) {
    const launcherTab = window.open("about:blank", "_blank");
    if (!launcherTab) {
        return false;
    }

    const tabDocument = launcherTab.document;
    applyLauncherTabSettings(tabDocument);

    const style = tabDocument.createElement("style");
    style.textContent = `
        html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: black;
        }

        iframe {
            display: block;
            width: 100%;
            height: 100%;
            border: none;
        }
    `;
    tabDocument.head.appendChild(style);

    const frame = tabDocument.createElement("iframe");
    frame.src = new URL(pagePath, window.location.href).href;
    frame.allowFullscreen = true;
    tabDocument.body.appendChild(frame);
    return true;
}

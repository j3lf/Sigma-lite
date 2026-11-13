// Sigma Jello site-wide settings

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

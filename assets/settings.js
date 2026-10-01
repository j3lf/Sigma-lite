// Sigma Jello site-wide settings

// No Tab Close
if (localStorage.getItem("noTabClose") === "true") {
    window.onbeforeunload = function(event) {
        event.preventDefault();
        event.returnValue = "";
        return "";
    };
}
(function () {
  const projectKey = "andenne-bears-feedback";
  const localEndpoint = "changethis.php";
  const productionEndpoint = "changethis.php";

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const endpoint = window.CHANGETHIS_ENDPOINT || (isLocal ? localEndpoint : productionEndpoint);
  const buttonConfig = window.CHANGETHIS_BUTTON || {};

  function bootChangeThis() {
    if (!window.ChangeThis || typeof window.ChangeThis.initChangeThis !== "function") {
      return;
    }

    window.ChangeThis.initChangeThis({
      projectKey,
      endpoint,
      buttonLabel: buttonConfig.label || "Feedback",
      buttonStateLabel: buttonConfig.stateLabel || (isLocal ? "Site en dev" : "Site en prod"),
      buttonVariant: buttonConfig.variant || (isLocal ? "dev" : "prod"),
      visible: false
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootChangeThis, { once: true });
  } else {
    bootChangeThis();
  }
})();

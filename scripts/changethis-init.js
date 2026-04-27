(function () {
  const projectKey = "andenne_bears_project_key";
  const localEndpoint = "http://localhost:3000/api/public/feedback";
  const productionEndpoint = "https://app.changethis.dev/api/public/feedback";

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

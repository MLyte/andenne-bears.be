(function () {
  const projectKey = "demo_project_key";
  const localEndpoint = "http://localhost:3000/api/public/feedback";
  const productionEndpoint = "https://app.changethis.dev/api/public/feedback";

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const endpoint = window.CHANGETHIS_ENDPOINT || (isLocal ? localEndpoint : productionEndpoint);

  function bootChangeThis() {
    if (!window.ChangeThis || typeof window.ChangeThis.initChangeThis !== "function") {
      return;
    }

    window.ChangeThis.initChangeThis({
      projectKey,
      endpoint
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootChangeThis, { once: true });
  } else {
    bootChangeThis();
  }
})();

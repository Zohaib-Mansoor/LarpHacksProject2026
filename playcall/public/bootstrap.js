// Keep the authored sample distinct from real database-backed rooms.
if (new URLSearchParams(location.search).get("demo") === "1")
  await import("./app.js");
else await import("./database-app.js");

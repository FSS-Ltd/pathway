export function requireLocalTestDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/pathway_realtime_notifications_test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Use the dedicated local pathway_realtime_notifications_test database",
    );
  }
  return url.toString();
}

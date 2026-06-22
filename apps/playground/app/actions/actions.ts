"use server";

// A real Server Action: invoked via POST with a `Next-Action` header, runs on the
// server. The middleware classifies the request as "action", so this upstream
// fetch is captured as `server:action`.
export async function runServerAction() {
  const res = await fetch("https://jsonplaceholder.typicode.com/todos/4", {
    cache: "no-store",
  });
  return res.json();
}

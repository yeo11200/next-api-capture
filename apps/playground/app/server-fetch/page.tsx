// Server Component — this fetch executes on the server during the RSC render.
// It never appears in the browser Network tab, but the library captures it as
// `server:rsc` and streams it to the DevTools panel.

async function getTodo() {
  const res = await fetch("https://jsonplaceholder.typicode.com/todos/1", {
    cache: "no-store",
  });
  return res.json();
}

export const dynamic = "force-dynamic";

export default async function ServerFetchPage() {
  const todo = await getTodo();
  return (
    <main>
      <h1>Server fetch (RSC)</h1>
      <p>
        Fetched on the server. Open the <strong>API Capture</strong> panel — you should see a
        <code> server:rsc</code> call to <code>jsonplaceholder.typicode.com/todos/1</code> that
        the browser Network tab does <em>not</em> show.
      </p>
      <pre style={pre}>{JSON.stringify(todo, null, 2)}</pre>
    </main>
  );
}

const pre = {
  background: "#f4f4f4",
  padding: 12,
  borderRadius: 6,
  overflow: "auto",
} as const;

"use client";

import { useState } from "react";

export default function ClientFetchPage() {
  const [todo, setTodo] = useState("");
  const [ping, setPing] = useState("");

  async function loadTodo() {
    const res = await fetch("https://jsonplaceholder.typicode.com/todos/2");
    setTodo(JSON.stringify(await res.json(), null, 2));
  }

  async function callPing() {
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    setPing(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <main>
      <h1>Client fetch</h1>
      <p>
        These run in the browser and are captured as <code>client:fetch</code>. The
        <code> /api/ping</code> call hits a Route Handler that performs its own server-side
        fetch (captured separately, under the route handler&apos;s own navigation).
      </p>
      <button onClick={loadTodo}>fetch jsonplaceholder (client)</button>
      <button onClick={callPing} style={{ marginLeft: 8 }}>
        POST /api/ping (route handler)
      </button>
      {todo && <pre style={pre}>{todo}</pre>}
      {ping && <pre style={pre}>{ping}</pre>}
    </main>
  );
}

const pre = {
  background: "#f4f4f4",
  padding: 12,
  borderRadius: 6,
  overflow: "auto",
} as const;

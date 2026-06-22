"use client";

import { useState } from "react";
import { runServerAction } from "./actions";

export default function ActionsPage() {
  const [result, setResult] = useState("");

  async function handleRun() {
    const data = await runServerAction();
    setResult(JSON.stringify(data, null, 2));
  }

  return (
    <main>
      <h1>Server Action</h1>
      <p>
        Clicking below invokes a real Server Action (a POST carrying a <code>Next-Action</code>{" "}
        header). Its server-side fetch is captured as <code>server:action</code>.
      </p>
      <button onClick={handleRun}>Run server action</button>
      {result && <pre style={pre}>{result}</pre>}
    </main>
  );
}

const pre = {
  background: "#f4f4f4",
  padding: 12,
  borderRadius: 6,
  overflow: "auto",
} as const;

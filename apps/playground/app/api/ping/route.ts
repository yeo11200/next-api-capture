import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Route Handler — runs on the server. Its upstream fetch is captured by the library.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const upstream = await fetch("https://jsonplaceholder.typicode.com/todos/3", {
    cache: "no-store",
  });
  const todo = await upstream.json();

  return NextResponse.json({ received: body, todo, at: new Date().toISOString() });
}

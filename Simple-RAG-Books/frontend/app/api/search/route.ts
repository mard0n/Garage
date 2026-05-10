import { NextRequest, NextResponse } from "next/server";

const RUNPOD_URL = process.env.RUNPOD_URL || "http://localhost:8000";
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const searchBody = {
      query: body.query,
      use_hyde: false,
      top_n: body.top_n || 10,
    };

    const res = await fetch(`${RUNPOD_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify(searchBody),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `RunPod error: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proxy error" },
      { status: 500 }
    );
  }
}
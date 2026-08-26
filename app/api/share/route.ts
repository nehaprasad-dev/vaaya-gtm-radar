import { NextResponse } from "next/server";

import { isRecordValue } from "@/lib/company";
import type { ShareSnapshot } from "@/lib/share";
import { getShareSnapshot, saveShareSnapshot } from "@/lib/share-store";

function isShareSnapshot(value: unknown): value is ShareSnapshot {
  if (!isRecordValue(value)) {
    return false;
  }

  return (
    value.v === 1 &&
    typeof value.requested_url === "string" &&
    isRecordValue(value.company) &&
    typeof value.company.company_name === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { snapshot?: unknown };

    if (!isShareSnapshot(body.snapshot)) {
      return NextResponse.json(
        { ok: false, error: "Send a valid insights snapshot." },
        { status: 400 },
      );
    }

    const id = saveShareSnapshot(body.snapshot);

    return NextResponse.json({
      ok: true,
      id,
      expires_in_hours: 12,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not create a share link." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing share id." },
      { status: 400 },
    );
  }

  const snapshot = getShareSnapshot(id);

  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "This share link expired or was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, snapshot });
}

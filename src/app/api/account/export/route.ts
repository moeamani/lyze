import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { exportUserData } from "@/server/services/users";

/** GET /api/account/export: the signed-in person's data as a JSON download. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="lyze-my-data.json"`, "cache-control": "no-store" },
  });
}

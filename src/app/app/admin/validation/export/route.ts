import { NextResponse } from "next/server";
import { validationSnapshotToCsv } from "@/lib/validation-snapshot";
import {
  currentUserIsInternalAdmin,
  loadValidationSnapshotAfterAdminGate
} from "@/lib/validation-snapshot-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const isInternalAdmin = await currentUserIsInternalAdmin(supabase, user.id);

  if (!isInternalAdmin) {
    return new NextResponse("Not found", { status: 404 });
  }

  const snapshot = await loadValidationSnapshotAfterAdminGate();
  const filename = `famtandem-validation-snapshot-${snapshot.generatedAt.slice(0, 10)}.csv`;

  return new NextResponse(validationSnapshotToCsv(snapshot), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}

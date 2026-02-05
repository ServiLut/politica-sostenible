import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { uploadToStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const taskId = formData.get("taskId") as string;

    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!taskId)
      return NextResponse.json(
        { error: "No Task ID provided" },
        { status: 400 },
      );

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `${taskId}/${timestamp}_${cleanFileName}`;

    // Upload to 'evidencia-mision' bucket
    const storedPath = await uploadToStorage(
      buffer,
      path,
      file.type,
      "evidencia-mision",
    );

    // Return the path so it can be saved in the database
    return NextResponse.json({ success: true, url: storedPath });
  } catch (error) {
    console.error("Evidence Upload Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

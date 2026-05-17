/**
 * api.upload.tsx — Return request photo upload endpoint
 *
 * POST /api/upload
 * Body: multipart/form-data, field "file" (image)
 * Returns: { url: string } | { error: string }
 *
 * Uploads directly to Supabase Storage via REST API (no Supabase client needed).
 */

import { json, type ActionFunctionArgs } from "@remix-run/node"

// Only POST is accepted
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: "Upload not configured" }, { status: 400 })
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: "Failed to parse form data" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || !(file instanceof File)) {
    return json({ error: "No file provided" }, { status: 400 })
  }

  // Sanitise original filename — strip non-alphanumeric/dot/dash chars
  const sanitisedName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()

  const storagePath = `return-photos/${Date.now()}-${sanitisedName}`

  // Read file bytes
  const fileBuffer = await file.arrayBuffer()

  // Upload to Supabase Storage via REST
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${storagePath}`

  let uploadRes: Response
  try {
    uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: fileBuffer,
    })
  } catch (err) {
    console.error("[api.upload] Supabase Storage fetch error:", err)
    return json({ error: "Upload failed" }, { status: 502 })
  }

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text().catch(() => "")
    console.error("[api.upload] Supabase Storage error:", uploadRes.status, errBody)
    return json({ error: "Upload failed" }, { status: 502 })
  }

  // Build public URL
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${storagePath}`

  return json({ url: publicUrl })
}

// GET is not supported — return 405
export async function loader() {
  return json({ error: "Method not allowed" }, { status: 405 })
}

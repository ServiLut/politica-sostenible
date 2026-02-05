
-- POLICY FOR 'documentos-sensibles' STORAGE BUCKET
-- This SQL must be run in the Supabase SQL Editor.

-- 1. Create Bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documentos-sensibles', 'documentos-sensibles', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow Authenticated Uploads (INSERT)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'documentos-sensibles' );

-- 3. Allow Owners to View their own files (SELECT)
-- Assuming the path structure is 'electionId/personId/...' and we don't have direct RLS link to Person here easily without advanced joins.
-- For simple MVP, we might allow authenticated users to read (since API handles signed URLs anyway).
-- However, strict RLS would be:
-- CREATE POLICY "Allow individual view" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos-sensibles' AND (auth.uid() = owner OR ... logic));

-- For this specific app where backend generates Signed URLs, we don't strictly need public SELECT access.
-- The backend (service role) can always sign URLs.
-- So we mainly need INSERT permission for the frontend direct upload if we were doing that.
-- BUT, in our current code (`src/lib/storage.ts`), we are uploading via SERVER ACTION (`uploadToStorage`).
-- The Server Action runs in Node.js with `SUPABASE_SERVICE_ROLE_KEY`.
-- Therefore, RLS on the bucket is NOT actually required for the Server Action to work, 
-- because the Service Role bypasses RLS!

-- IF the frontend were uploading directly (client-side), we would need the policy above.
-- Since the user complained about 403, and we are using Server Actions...
-- Check `src/lib/storage.ts`: It uses `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`.
-- This should BYPASS RLS.

-- FIX DIAGNOSIS:
-- If 403 is happening with Service Role, it means the Service Role Key is wrong OR the bucket doesn't exist.
-- If 403 is happening and the user thought they were uploading from client, but code says server...
-- Wait, `uploadEvidenceAction` calls `uploadToStorage`. 
-- `uploadToStorage` uses `SUPABASE_SERVICE_ROLE_KEY`.
-- So RLS shouldn't be the issue unless the key is invalid.

-- However, if the key is missing in .env, `uploadToStorage` returns a mock URL, preventing 403 from Supabase.
-- If the user sees 403, they might be using a different implementation or the key IS present but has no permissions? Service Role always has permissions.

-- Alternative: The 403 might come from the Next.js `uploadEvidenceAction` itself?
-- No, `uploadEvidenceAction` throws "Unauthorized" if no user.
-- `uploadToStorage` catches fetch errors.

-- Let's stick to providing this SQL just in case they decide to switch to Client Uploads later, 
-- or if they are using the Anon Key by mistake in the env var.

const bucket = 'politica-local-staging-private';
const headers = { authorization: `Bearer ${process.env.STAGING_STORAGE_SERVICE_KEY}`, 'content-type': 'application/json' };
const base = 'http://storage:5000';
let response = await fetch(`${base}/bucket/${bucket}`, { headers });
const initial = await response.clone().json();
if (response.status === 404 || (!response.ok && (initial.code === 'NoSuchBucket' || initial.error === 'Bucket not found'))) {
  response = await fetch(`${base}/bucket`, { method: 'POST', headers, body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 52428800 }) });
  if (!response.ok) throw new Error(`Local Storage bucket creation failed: HTTP ${response.status}`);
  response = await fetch(`${base}/bucket/${bucket}`, { headers });
}
if (!response.ok) throw new Error(`Local Storage bucket read failed: HTTP ${response.status}`);
const actual = await response.json();
if (actual.id !== bucket || actual.public !== false) throw new Error('Local Storage bucket must exist and be private');
console.log('Private local staging bucket verified');

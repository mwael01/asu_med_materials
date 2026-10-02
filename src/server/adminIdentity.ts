/** Verify the token with Firebase Auth, then authorize against the current Firestore profile. */
export async function verifyMetadataAdmin(request: Request): Promise<boolean> {
  const match = request.headers.get('authorization')?.match(/^Bearer (\S+)$/);
  const apiKey = import.meta.env.PUBLIC_FIREBASE_API_KEY;
  const project = import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
  if (!match || !apiKey || !project) return false;
  const signal = AbortSignal.timeout(8000);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:match[1]}), signal,
  });
  if (!response.ok) return false;
  const data = await response.json() as {users?: Array<{localId?: string; disabled?: boolean}>};
  const user = data.users?.[0];
  if (!user?.localId || user.disabled) return false;
  const profile = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/users/${encodeURIComponent(user.localId)}`, {
    headers:{Authorization:`Bearer ${match[1]}`}, signal,
  });
  if (!profile.ok) return false;
  const document = await profile.json() as {fields?: {role?: {stringValue?: string}}};
  return document.fields?.role?.stringValue === 'admin';
}

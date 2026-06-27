const PROFILE_API = (process.env.NEXT_PUBLIC_PROFILE_API || "").replace(/\/$/, "");

function toDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function uploadImage(file: File): Promise<string> {
  if (!PROFILE_API) throw new Error("upload endpoint not configured");
  const dataUrl = await toDataURL(file);
  const res = await fetch(`${PROFILE_API}/api/upload/irys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: dataUrl, contentType: file.type || "image/webp" }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.statusText}`);
  const d = await res.json();
  if (!d.url) throw new Error("no URL in upload response");
  return d.url as string;
}

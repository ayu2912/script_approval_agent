const SCOPES = ["https://www.googleapis.com/auth/drive"];

function getConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  if (!email || !privateKey || !parentFolderId) {
    return null;
  }

  return { email, privateKey, parentFolderId };
}

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const { createSign } = await import("crypto");

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned = `${encode(header)}.${encode(claimSet)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(privateKey, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

interface CreateClientFolderParams {
  clientName: string;
  company?: string;
  clientEmail?: string;
}

interface CreateClientFolderResult {
  success: boolean;
  error?: string;
  folderId?: string;
  folderUrl?: string;
}

export async function createClientFolder({
  clientName,
  company,
  clientEmail,
}: CreateClientFolderParams): Promise<CreateClientFolderResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      error: "Google Drive not configured — missing GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, or GOOGLE_DRIVE_PARENT_FOLDER_ID",
    };
  }

  try {
    const token = await getAccessToken(config.email, config.privateKey);
    const folderName = company ? `${company} - ${clientName}` : clientName;

    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [config.parentFolderId],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      return { success: false, error: `Failed to create folder: ${createRes.status} ${text}` };
    }

    const folder = await createRes.json();
    const folderId: string = folder.id;
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    if (clientEmail) {
      const shareRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "user",
            role: "reader",
            emailAddress: clientEmail,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!shareRes.ok) {
        console.warn(`[google-drive] Folder created but sharing failed: ${shareRes.status}`);
      }
    }

    return { success: true, folderId, folderUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Drive operation failed";
    console.error("[google-drive] Failed:", message);
    return { success: false, error: message };
  }
}

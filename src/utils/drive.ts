export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  size?: string;
  modifiedTime?: string;
}

export function extractDriveId(input: string): string | null {
  if (!input) return null;
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return input.trim();
}

export async function fetchDriveMetadata(driveUrl: string): Promise<DriveFile[]> {
  const driveId = extractDriveId(driveUrl);
  if (!driveId) {
    throw new Error(`Invalid Google Drive URL: ${driveUrl}`);
  }

  const isFolder = driveUrl.includes('/folders/') || !driveUrl.includes('/d/');
  const url = isFolder
    ? `https://drive.google.com/drive/folders/${driveId}`
    : `https://drive.google.com/file/d/${driveId}/view`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ar,en;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Drive content: HTTP ${res.status}`);
  }

  const html = await res.text();
  const files: DriveFile[] = [];

  const fileRegex = /"([a-zA-Z0-9_-]{25,})"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/g;
  let m;
  while ((m = fileRegex.exec(html)) !== null) {
    const [, id, name, mimeType] = m;
    files.push({
      id,
      name: name.replace(/\\u0026/g, '&').replace(/\\"/g, '"'),
      mimeType,
      url: `https://drive.google.com/file/d/${id}/view`
    });
  }

  if (files.length === 0) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      files.push({
        id: driveId,
        name: titleMatch[1].replace(' - Google Drive', '').trim(),
        mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
        url
      });
    }
  }

  return files;
}

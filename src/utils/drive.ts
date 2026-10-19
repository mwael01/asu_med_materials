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

  const ivdMatch = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'([^']+)'/);
  if (ivdMatch) {
    try {
      const uEscape = ivdMatch[1].replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
      const decoded = JSON.parse('"' + uEscape.replace(/"/g, '\\"') + '"');
      const data = JSON.parse(decoded);
      if (Array.isArray(data) && Array.isArray(data[0])) {
        for (const item of data[0]) {
          const fileId = item[0];
          const fileName = item[2];
          const mimeType = item[3] || 'application/octet-stream';
          if (fileId && fileName) {
            files.push({
              id: fileId,
              name: fileName,
              mimeType,
              url: mimeType === 'application/vnd.google-apps.folder'
                ? `https://drive.google.com/drive/folders/${fileId}`
                : `https://drive.google.com/file/d/${fileId}/view`
            });
          }
        }
      }
    } catch {
      // Fallback to title / regex below
    }
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

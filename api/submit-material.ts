// @ts-nocheck
/**
 * Vercel Serverless Function & Dev Middleware Handler: POST /api/submit-material
 * Handles student material submissions and forwards them directly to Google Sheets
 * via Google Apps Script Webhook.
 */

function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(?:https?:\/\/|ftps?:\/\/|www\.|(?:t\.me|drive\.google\.com|youtube\.com|youtu\.be|mega\.nz|notion\.site|notion\.so|mediafire\.com)\/)[^\s<>"'{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex) || [];

  const normalized = matches.map((rawUrl) => {
    let u = rawUrl.trim();
    // Strip trailing punctuation often found in arabic text
    u = u.replace(/[\.\,\:\;\!\؟\?]+$/, '');
    if (!/^https?:\/\//i.test(u)) {
      u = `https://${u}`;
    }
    return u;
  });

  return Array.from(new Set(normalized));
}

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'طريقة الطلب غير مسموحة (Method Not Allowed)' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { success: false, error: 'بيانات غير صالحة (Invalid JSON)' });
    }
  }

  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { success: false, error: 'لم يتم استلام أي بيانات صالحة' });
  }

  const mode = body.mode || (body.content ? 'dump' : 'single');
  let forwardPayload: Record<string, any>;

  if (mode === 'dump') {
    const content = (body.content || '').trim();
    if (!content) {
      return sendJson(res, 400, { success: false, error: 'من فضلك الصق رابط أو نص الرسالة قبل الإرسال' });
    }

    const detectedUrls = extractUrls(content);
    const contributor = (body.contributor || body.senderName || body.addedBy || '').toString().trim() || 'فاعل خير';
    const year = body.year && body.year !== 'general' ? body.year : 'general';
    const moduleId = body.moduleId || body.module || 'عام';
    const notes = (body.notes || body.title || '').trim();

    forwardPayload = {
      mode: 'dump',
      content,
      urls: detectedUrls,
      contributor,
      year,
      moduleId,
      notes,
      title: notes,
      timestamp: new Date().toISOString()
    };
  } else {
    // Single structured resource
    const url = (body.url || '').trim();
    if (!url && !body.title) {
      return sendJson(res, 400, { success: false, error: 'يرجى كتابة رابط أو عنوان المصدر على الأقل' });
    }

    const title = (body.title || '').trim() || url;
    const contributor = (body.addedBy || body.contributor || '').toString().trim() || 'فاعل خير';
    const year = body.year && body.year !== 'general' ? body.year : 'general';
    const moduleId = body.moduleId || body.module || 'عام';
    const notes = (body.description || '').trim();
    const detectedUrls = url ? [url] : [];

    forwardPayload = {
      mode: 'single',
      url,
      content: url,
      urls: detectedUrls,
      title,
      contributor,
      year,
      moduleId,
      notes,
      subject: body.subject || 'عام',
      type: body.type || 'drive',
      timestamp: new Date().toISOString()
    };
  }

  const env = (typeof process !== 'undefined' ? process.env : {}) || {};
  const webhookUrl = env.GOOGLE_SHEETS_WEBHOOK_URL || env.SUBMISSION_WEBHOOK_URL;

  // Local development / testing fallback when no webhook is set
  if (!webhookUrl) {
    console.warn('[DEV] No GOOGLE_SHEETS_WEBHOOK_URL configured. Mocking successful submission.');
    return sendJson(res, 200, {
      success: true,
      mock: true,
      timestamp: new Date().toISOString(),
      message: 'Mock submission succeeded (no webhook URL configured in environment)'
    });
  }

  try {
    const sheetRes = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(forwardPayload),
      redirect: 'follow'
    });

    const responseText = await sheetRes.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { text: responseText };
    }

    if (!sheetRes.ok || (responseData && responseData.success === false)) {
      return sendJson(res, 502, {
        success: false,
        error: responseData?.error || 'تعذر تسجيل المساهمة في Google Sheets',
        details: responseData
      });
    }

    return sendJson(res, 200, {
      success: true,
      timestamp: responseData?.timestamp || new Date().toISOString(),
      row: responseData?.row
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'حدث خطأ في الاتصال بالخادم أثناء إرسال البيانات'
    });
  }
}

// @ts-nocheck
/**
 * Vercel Serverless Function & Dev Middleware Handler: POST /api/submit-feedback
 * Handles student feedback, bug reports, and suggestions and forwards them directly to Google Sheets
 * via Google Apps Script Webhook.
 */

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(data));
}

const VALID_CATEGORIES = new Set(['suggestion', 'content_issue', 'bug', 'general']);

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

  const message = (body.message || '').toString().trim();
  if (!message) {
    return sendJson(res, 400, { success: false, error: 'من فضلك اكتب نص الملاحظات أو الاقتراح قبل الإرسال' });
  }

  const rawCategory = (body.category || '').toString().trim().toLowerCase();
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general';
  const year = body.year && body.year !== 'general' ? body.year : 'general';
  const moduleId = (body.moduleId || body.module || 'general').toString().trim();
  const senderName = (body.senderName || body.name || body.contributor || '').toString().trim() || 'فاعل خير';
  const contact = (body.contact || body.email || body.telegram || '').toString().trim();
  const pageUrl = (body.pageUrl || body.url || '').toString().trim();

  const forwardPayload = {
    type: 'feedback',
    mode: 'feedback',
    sheet: 'Feedback',
    category,
    message,
    year,
    moduleId,
    senderName,
    contact,
    pageUrl,
    timestamp: new Date().toISOString()
  };

  const env = (typeof process !== 'undefined' ? process.env : {}) || {};
  const webhookUrl =
    env.GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL ||
    env.FEEDBACK_WEBHOOK_URL ||
    env.GOOGLE_SHEETS_WEBHOOK_URL ||
    env.SUBMISSION_WEBHOOK_URL;

  // Local development / testing fallback when no webhook is set
  if (!webhookUrl) {
    console.warn('[DEV] No GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL or GOOGLE_SHEETS_WEBHOOK_URL configured. Mocking successful submission.');
    return sendJson(res, 200, {
      success: true,
      mock: true,
      timestamp: new Date().toISOString(),
      message: 'Mock feedback submission succeeded (no webhook URL configured in environment)'
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
        error: responseData?.error || 'تعذر تسجيل الملاحظات في Google Sheets',
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
      error: err?.message || 'حدث خطأ في الاتصال بالخادم أثناء إرسال الملاحظات'
    });
  }
}

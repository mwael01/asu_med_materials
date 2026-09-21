// @ts-nocheck
/**
 * Vercel Serverless Function: POST /api/submit-material
 * Automatically creates a GitHub Issue on the repository using GitHub Issues API
 */
export default async function handler(req, res) {
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

  if (!body) {
    return sendJson(res, 400, { success: false, error: 'لم يتم استلام أي بيانات' });
  }

  const { title, url, year, module: moduleCode, subject, type, authors } = body;

  if (!title || !url || !authors) {
    return sendJson(res, 400, { success: false, error: 'من فضلك املأ جميع الحقول الإلزامية (الاسم، العنوان، الرابط)' });
  }

  // Token retrieval from Vercel environment variables
  const env = (typeof process !== 'undefined' ? process.env : {}) || {};
  const token = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GH_TOKEN;

  if (!token) {
    return sendJson(res, 500, {
      success: false,
      error: 'رمز GITHUB_TOKEN غير مضبوط في إعدادات Vercel. يرجى إضافته في Vercel Dashboard تحت Environment Variables.'
    });
  }

  const authorList = Array.isArray(authors) ? authors.join('، ') : String(authors);

  const issueTitle = `[إضافة مصدر]: ${String(title).trim()}`;
  const issueBody = `### بيانات المصدر المقترح
- **اسم المصدر:** ${String(title).trim()}
- **الرابط:** ${String(url).trim()}
- **السنة الدراسية:** السنة ${year || 'غير محدد'}
- **الموديول:** ${moduleCode || 'عام'}
- **المادة:** ${subject || 'عام / كل الموديول'}
- **نوع المصدر:** ${type || 'غير محدد'}
- **إعداد:** ${authorList || 'غير محدد'}

---
_تم الإرسال تلقائياً عبر نموذج مشاركة المصادر في منصة ASU Med Materials_`;

  try {
    const ghRes = await fetch('https://api.github.com/repos/mwael01/asu_med_materials/issues', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'ASU-Med-Materials-Vercel-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody
      })
    });

    const data = await ghRes.json();

    if (!ghRes.ok) {
      return sendJson(res, ghRes.status, {
        success: false,
        error: data.message || 'فشل إنشاء التذكرة عبر GitHub API',
        details: data
      });
    }

    return sendJson(res, 201, {
      success: true,
      issueNumber: data.number,
      issueUrl: data.html_url
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'حدث خطأ في الاتصال بالخادم أثناء إنشاء التذكرة'
    });
  }
}

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}

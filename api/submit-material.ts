// @ts-nocheck
/**
 * Vercel Serverless Function & Dev Middleware Handler: POST /api/submit-material
 * Handles both permissive dump submissions (WhatsApp messages, multiple links, text blocks)
 * and structured individual resource submissions, creating GitHub Issues on the repository.
 */

function extractUrls(text: string): string[] {
  if (!text) return [];
  // Regex to match URLs with protocols or known popular domains
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
  let issueTitle = '';
  let issueBody = '';
  const now = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  if (mode === 'dump') {
    const content = (body.content || '').trim();
    if (!content) {
      return sendJson(res, 400, { success: false, error: 'من فضلك الصق رسالة الواتساب أو الروابط قبل الإرسال' });
    }

    const contributor = (body.contributor || body.senderName || body.authors || '').toString().trim() || 'فاعل خير (لم يحدد)';
    const year = body.year && body.year !== 'general' ? `السنة ${body.year}` : 'غير محدد / متنوع';
    const moduleId = body.moduleId || body.module || 'غير محدد / متنوع';
    const notes = (body.notes || '').trim();

    const detectedUrls = extractUrls(content);

    // Create a clean informative title
    const firstLine = content.split('\n')[0].replace(/https?:\/\/\S+/g, '').replace(/[\*\_#]/g, '').trim();
    const titleSnippet = firstLine ? firstLine.slice(0, 45) : 'رسالة مجمعة';
    const linkBadge = detectedUrls.length > 0 ? ` (${detectedUrls.length} رابط)` : '';
    issueTitle = `[تفريغ مصادر]: ${titleSnippet}${linkBadge}`;

    issueBody = `### 📥 تفريغ مصادر دراسية مجمعة (Materials Dump)

| الحقل | التفاصيل |
| :--- | :--- |
| 👤 **المساهم / أضافها** | ${contributor} |
| 🎓 **السنة الدراسية** | ${year} |
| 📚 **الموديول** | ${moduleId} |
| 🔗 **الروابط المكتشفة** | ${detectedUrls.length} رابط |
| 🕒 **تاريخ الإرسال** | ${now} |

---

#### 📝 نص الرسالة / النص المفرغ:
\`\`\`text
${content}
\`\`\`

${detectedUrls.length > 0 ? `
#### 📋 قائمة الروابط المستخرجة للمعاينة والإضافة:
${detectedUrls.map((url, i) => `- [ ] **[رابط ${i + 1}](${url})**: \`${url}\``).join('\n')}
` : ''}

${notes ? `
#### 💡 ملاحظات إضافية من المساهم:
> ${notes}
` : ''}

---
_تم الإرسال عبر ميزة تفريغ المصادر في ASU Med Materials_
`;
  } else {
    // Single structured submission
    const url = (body.url || '').trim();
    if (!url && !body.title) {
      return sendJson(res, 400, { success: false, error: 'يرجى كتابة رابط أو عنوان المصدر على الأقل' });
    }

    const title = (body.title || '').trim() || url;
    const type = body.type || 'drive';
    const year = body.year && body.year !== 'general' ? `السنة ${body.year}` : 'غير محدد / عام';
    const moduleId = body.moduleId || body.module || 'غير محدد / عام';
    const subject = body.subject || 'عام';
    const author = Array.isArray(body.authors)
      ? body.authors.join('، ')
      : (body.authors || body.author || 'غير محدد');
    const addedBy = body.addedBy || body.contributor || 'فاعل خير';
    const description = (body.description || '').trim();

    issueTitle = `[إضافة مصدر]: ${title}`;
    issueBody = `### 📥 اقتراح إضافة مصدر جديد (Individual Material)

| الحقل | التفاصيل |
| :--- | :--- |
| 📌 **اسم المصدر** | ${title} |
| 🔗 **الرابط** | [${url}](${url}) |
| 🏷️ **نوع المصدر** | ${type} |
| 🎓 **السنة الدراسية** | ${year} |
| 📚 **الموديول** | ${moduleId} |
| 🔬 **المادة** | ${subject} |
| ✍️ **إعداد** | ${author} |
| 👤 **أضافها** | ${addedBy} |
| 🕒 **تاريخ الإرسال** | ${now} |

---

${description ? `
#### 📝 الوصف والملاحظات:
> ${description}
` : ''}

---
_تم الإرسال تلقائياً عبر نموذج مشاركة المصادر في منصة ASU Med Materials_
`;
  }

  // Pre-generate fallback URL so the client has it in any scenario
  const fallbackUrl = `https://github.com/mwael01/asu_med_materials/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  // Retrieve GitHub Token
  const env = (typeof process !== 'undefined' ? process.env : {}) || {};
  const token = env.GITHUB_TOKEN || env.GITHUB_PAT || env.GH_TOKEN;

  if (!token) {
    return sendJson(res, 200, {
      success: false,
      fallbackUrl,
      error: 'لم يتم ضبط مفتاح GITHUB_TOKEN بالخادم، تم تجهيز بيانات التذكرة لفتحها مباشرة.',
      requiresDirectGithub: true
    });
  }

  try {
    const ghRes = await fetch('https://api.github.com/repos/mwael01/asu_med_materials/issues', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'ASU-Med-Materials-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: mode === 'dump' ? ['materials-dump', 'community-submission'] : ['material-submission']
      })
    });

    const data = await ghRes.json();

    if (!ghRes.ok) {
      return sendJson(res, ghRes.status, {
        success: false,
        fallbackUrl,
        error: data.message || 'فشل إنشاء التذكرة عبر GitHub API',
        details: data
      });
    }

    return sendJson(res, 201, {
      success: true,
      issueNumber: data.number,
      issueUrl: data.html_url
    });
  } catch (err: any) {
    return sendJson(res, 500, {
      success: false,
      fallbackUrl,
      error: err?.message || 'حدث خطأ في الاتصال بالخادم أثناء إنشاء التذكرة'
    });
  }
}

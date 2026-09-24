/**
 * ============================================================================
 * ASU Med Materials - Google Sheets Feedback Webhook Script
 * ============================================================================
 *
 * This Google Apps Script acts as a serverless webhook endpoint that receives
 * student feedback, suggestions, broken link reports, and bugs submitted via
 * the ASU Med Materials website (/feedback) and appends them into your Google
 * Sheet for review and resolution.
 *
 * ----------------------------------------------------------------------------
 * 📋 HOW TO DEPLOY THIS SCRIPT (5-Step Guide):
 * ----------------------------------------------------------------------------
 *
 * Step 1: Create or Open a Google Sheet
 *   1. Go to https://sheets.new (or open your existing materials sheet).
 *   2. Title the sheet: "ASU Med Materials - Feedback" (or add a tab named "Feedback").
 *
 * Step 2: Open Google Apps Script
 *   1. In your Google Sheet top menu, click:
 *      Extensions (الإضافات) -> Apps Script.
 *   2. Erase any placeholder code inside "Code.gs".
 *   3. Copy this entire file and paste it into the Apps Script editor.
 *   4. Save the project (Ctrl + S or Cmd + S).
 *
 * Step 3: Deploy as a Web App
 *   1. In the top-right corner, click the blue "Deploy" (نشر / تطوير) button.
 *   2. Choose: "New deployment" (نشر جديد).
 *   3. Click the gear icon (⚙️) next to "Select type" and choose "Web app" (تطبيق ويب).
 *   4. Set the deployment fields:
 *      - Description: "ASU Med Materials Feedback Webhook"
 *      - Execute as: "Me" (your Google account email)
 *      - Who has access: "Anyone" (أي شخص)
 *        ⚠️ CRITICAL: Must be "Anyone" so the serverless function can post rows
 *        without requiring a Google login.
 *   5. Click "Deploy" (نشر).
 *   6. Click "Authorize access" (منح الإذن) and select your Google account.
 *      (If you see "Google hasn't verified this app", click "Advanced" /
 *      "إعدادات متقدمة" -> "Go to Untitled project (unsafe)" -> "Allow" / "سماح").
 *   7. Copy the generated "Web app URL"
 *      (It looks like: https://script.google.com/macros/s/AKfycb.../exec).
 *
 * Step 4: Add Environment Variable in Vercel & Locally
 *   1. In Vercel Project Settings -> "Environment Variables":
 *      - Key: GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL
 *      - Value: <paste the Web app URL copied in Step 3>
 *      - Environments: Production, Preview, Development.
 *   2. For local testing, add the same variable to your .env file:
 *      GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
 *
 * Step 5: Updating the Script in the Future
 *   Whenever you update this script code in the Google editor:
 *   1. Click "Deploy" -> "Manage deployments".
 *   2. Click the pencil icon (Edit) on your deployment.
 *   3. Under "Version", select "New version".
 *   4. Click "Deploy". The Web app URL stays the exact same!
 *
 * ============================================================================
 */

/**
 * Category translation and styling map
 */
var CATEGORY_LABELS = {
  suggestion: "💡 اقتراح ميزة (Suggestion)",
  content_issue: "🔗 مشكلة محتوى / رابط (Content Issue)",
  bug: "🐛 مشكلة تقنية (Bug)",
  general: "💬 رأي عام (General)"
};

/**
 * Handles incoming HTTP POST requests from /api/submit-feedback
 */
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Support dedicated tab named "Feedback", otherwise use active sheet
    var sheet = ss.getSheetByName("Feedback") || ss.getActiveSheet();
    var data = {};

    // Parse JSON body
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "لم يتم استلام أي بيانات صالحة (Empty payload)"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Auto-create styled header row if the sheet is completely empty
    if (sheet.getLastRow() === 0) {
      var headers = [
        "التاريخ والوقت",
        "نوع الملاحظة",
        "نص الملاحظات / التفاصيل",
        "السنة الدراسية",
        "الموديول",
        "المرسل",
        "وسيلة التواصل",
        "صفحة الإرسال",
        "حالة المتابعة"
      ];
      sheet.appendRow(headers);

      // Style header: Emerald background, white bold text, freeze top row
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#059669");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }

    // Normalize and format data fields
    var timestamp = data.timestamp || new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
    var categoryKey = (data.category || "general").toString().toLowerCase();
    var category = CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS.general;
    var message = (data.message || "").toString().trim();
    var year = (data.year || "عام").toString();
    var moduleName = (data.moduleId || data.module || "عام").toString();
    var senderName = (data.senderName || data.name || "فاعل خير").toString().trim();
    var contact = (data.contact || "").toString().trim();
    var pageUrl = (data.pageUrl || "").toString().trim();
    var status = "جديد (New)";

    // Append new feedback row
    sheet.appendRow([
      timestamp,
      category,
      message,
      year,
      moduleName,
      senderName,
      contact,
      pageUrl,
      status
    ]);

    // Return JSON response to website
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      timestamp: timestamp,
      row: sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles incoming HTTP GET requests (useful for browser testing)
 */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "ASU Med Materials Google Sheets Feedback Webhook is active and running!"
  })).setMimeType(ContentService.MimeType.JSON);
}

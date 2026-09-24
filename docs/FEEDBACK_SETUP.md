# Google Sheets Webhook Setup Guide for Feedback

This guide details how to connect the **ASU Med Materials** feedback flow (`/feedback`) to your Google Spreadsheet via Google Apps Script.

---

## 1. Google Sheets Setup

You can either:
- **Option A (Recommended)**: Use a dedicated Google Sheet just for Feedback.
- **Option B**: Add a new tab named `Feedback` in your existing Contributions spreadsheet.

### Recommended Spreadsheet Columns
Create the following column headers in Row 1 of your sheet:

| Col A | Col B | Col C | Col D | Col E | Col F | Col G | Col H |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Timestamp** | **Category** | **Message** | **Academic Year** | **Module** | **Sender Name** | **Contact** | **Page URL** |

---

## 2. Google Apps Script Webhook Code

The complete script file is located at [`scripts/google-sheets-feedback.js`](file:///workspaces/asu_med_materials/scripts/google-sheets-feedback.js).

1. In your Google Sheet, click **Extensions > Apps Script**.
2. Replace any existing code in `Code.gs` with the contents of [`scripts/google-sheets-feedback.js`](file:///workspaces/asu_med_materials/scripts/google-sheets-feedback.js) (or the snippet below):

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Check if payload is for feedback or regular material submission
    const isFeedback = data.type === 'feedback' || data.mode === 'feedback';

    // Auto-select tab: look for "Feedback" tab if feedback, otherwise active sheet
    let targetSheet;
    if (isFeedback) {
      targetSheet = ss.getSheetByName("Feedback") || ss.getActiveSheet();
      targetSheet.appendRow([
        data.timestamp || new Date(),
        data.category || "general",
        data.message || "",
        data.year || "general",
        data.moduleId || "general",
        data.senderName || "فاعل خير",
        data.contact || "",
        data.pageUrl || ""
      ]);
    } else {
      targetSheet = ss.getSheetByName("Submissions") || ss.getActiveSheet();
      targetSheet.appendRow([
        data.timestamp || new Date(),
        data.mode || "single",
        data.title || "",
        (data.urls && data.urls.length) ? data.urls.join("\n") : (data.url || ""),
        data.year || "general",
        data.moduleId || "general",
        data.contributor || "فاعل خير",
        data.notes || data.content || ""
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, timestamp: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 3. Deploying as a Web App

1. In the Apps Script editor, click the blue **Deploy** button (top-right) > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the details:
   - **Description**: `ASU Med Materials Feedback & Submissions Webhook`
   - **Execute as**: `Me (your email)`
   - **Who has access**: **`Anyone`** *(Crucial: must be "Anyone" so serverless functions can POST without Google OAuth prompts)*
4. Click **Deploy**.
5. Grant permissions if prompted by Google.
6. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/AKfycbx.../exec`).

---

## 4. Configure Environment Variables

### In Production (Vercel)
1. Go to your project dashboard on [Vercel](https://vercel.com).
2. Navigate to **Settings > Environment Variables**.
3. Add:
   - Key: `GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL` (or `GOOGLE_SHEETS_WEBHOOK_URL` if sharing one webhook)
   - Value: `https://script.google.com/macros/s/AKfycbx.../exec`
4. Redeploy or trigger a new build.

### In Local Development
Create or update `.env` in the project root:
```env
GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbx.../exec
```
*(If no environment variable is provided, the API automatically runs in mock mode and logs a notice while returning `{ success: true, mock: true }`)*

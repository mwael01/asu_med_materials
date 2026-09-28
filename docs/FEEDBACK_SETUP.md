# Feedback & Submissions: Cloud Firestore Setup Guide

Student feedback and study material contributions are stored **exclusively in Cloud Firestore**, eliminating third-party webhook dependencies and Google Sheets quota limits.

---

## 1. Firestore Collections

Submissions and feedback write directly into dedicated Firestore collections:

| Collection | Document Schema | Access Controls | Purpose |
| :--- | :--- | :--- | :--- |
| `submissions` | `SubmissionDocument` | Create: Open (all users) <br> Read/Update/Delete: Authenticated Admins | Receives material links, dumps, and notes from `/contribute`. |
| `feedback` | `FeedbackDocument` | Create: Open (all users) <br> Read/Update/Delete: Authenticated Admins | Receives suggestions, broken link reports, and bugs from `/feedback`. |
| `admin_logs` | `AdminLogDocument` | Create/Read: Authenticated Admins <br> Update/Delete: Denied (Immutable) | Audit log of all administrative actions. |

---

## 2. Admin Review Workflow

Administrators can review and manage everything directly from the web interface on `/contribute`:

1. Sign in with an administrator account (`role: 'admin'`).
2. Visit `/contribute` (the page automatically renders the **Admin Management Flow**).
3. **Submissions Tab**:
   - Review pending material submissions.
   - Use **✨ AI Review** (Gemini 3.8 Flash) to parse abrupt text/WhatsApp dumps into structured fields.
   - Click **Approve & Publish** to add the material to the platform catalog and give credit to the student.
4. **Feedback Tab**:
   - Review student feedback categorized as (💡 Suggestion, 🔗 Content Issue / Broken Link, 🐛 Bug, 💬 General).
   - Mark items as reviewed or delete resolved issues.
5. **Activity Log Tab**:
   - View transparent audit records of all admin actions with timestamps and admin handles.

---

## 3. App Check & Security

The platform utilizes **Firebase App Check** with **reCAPTCHA Enterprise** (`6LcmYdQtAAAAADm7iH3OYMYvLHHo4dYARdzT2AHl`) to protect Firestore and AI endpoints from unauthorized bot abuse.

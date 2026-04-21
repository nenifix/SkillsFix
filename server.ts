import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from 'resend';
import { google } from 'googleapis';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = "godwintext@gmail.com";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback` || 'http://localhost:3000/auth/callback'
);

// Initialize Firebase Admin
if (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for step notification
  app.post("/api/enrollment-update", async (req, res) => {
    const { student_data, current_step, timestamp } = req.body;
    
    console.log(`[Enrollment Update] Step: ${current_step} - ${student_data.full_name || 'Anonymous'}`);

    // 1. Email Notification
    if (resend) {
      try {
        await resend.emails.send({
          from: 'SkillsFix Assistant <onboarding@resend.dev>',
          to: ADMIN_EMAIL,
          subject: `Enrollment Update: ${student_data.full_name || 'Partial Entry'} (${current_step})`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee;">
              <h2 style="color: #0A84FF;">SkillsFix Enrollment Progress</h2>
              <p><strong>Step:</strong> ${current_step}</p>
              <p><strong>Timestamp:</strong> ${timestamp}</p>
              <hr />
              <pre style="background: #f4f4f4; padding: 15px; border-radius: 8px;">${JSON.stringify(student_data, null, 2)}</pre>
            </div>
          `
        });
      } catch (error) {
        console.error("Failed to send administrative email:", error);
      }
    }

    // 2. Automated Google Sheets Sync on Completion
    if (current_step === 'completed' && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      try {
        const db = admin.firestore();
        // Look for the Master Sheet ID and Tokens in a global settings doc
        const settingsSnap = await db.collection('platform_settings').doc('google_sheets').get();
        if (settingsSnap.exists) {
          const { spreadsheetId, tokens } = settingsSnap.data() as any;
          if (spreadsheetId && tokens) {
            const auth = new google.auth.OAuth2();
            auth.setCredentials(tokens);
            const sheets = google.sheets({ version: 'v4', auth });
            
            const rowData = [
              student_data.full_name || 'N/A',
              student_data.email || 'N/A',
              student_data.phone || 'N/A',
              `${student_data.location_city || ''}, ${student_data.location_country || ''}`,
              current_step,
              student_data.coding_experience_level || 'N/A',
              student_data.primary_motivation || 'N/A',
              student_data.desired_outcome || 'N/A',
              timestamp
            ];

            await sheets.spreadsheets.values.append({
              spreadsheetId: spreadsheetId,
              range: 'Sheet1!A2',
              valueInputOption: 'RAW',
              requestBody: {
                values: [rowData]
              }
            });
            console.log(`[Google Sheets] Success - Appended ${student_data.email}`);
          }
        }
      } catch (e) {
        console.error("[Google Sheets] Background sync failed:", e);
      }
    }

    res.json({ success: true });
  });

  // --- Google Sheets Integration ---

  app.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
      prompt: 'select_account'
    });
    res.json({ url });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // We'll pass the tokens back to the parent window via postMessage
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #1c1c1e; color: white;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                document.body.innerHTML = '<h2>Authentication Successful</h2><p>You can close this window now.</p>';
              }
            </script>
            <div style="text-align: center;">
              <h2 style="color: #32D74B;">Authenticated!</h2>
              <p>Closing window and returning to SkillsFix...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google Auth Error:", error);
      res.status(500).send("Authentication failed. Please try again.");
    }
  });

  app.post('/api/export/google-sheets', async (req, res) => {
    const { tokens, enrollments } = req.body;
    if (!tokens || !enrollments) return res.status(400).json({ error: "Missing tokens or data" });

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials(tokens);
      const sheets = google.sheets({ version: 'v4', auth });

      // 1. Create a new spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `SkillsFix Enrollment Records - ${new Date().toLocaleDateString()}`
          }
        }
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId;

      // 2. Prepare data
      const headers = ["Full Name", "Email", "Phone", "Location", "Step", "Experience", "Motivation", "Goal", "Updated At"];
      const rows = enrollments.map((r: any) => [
        r.student_data?.full_name || 'N/A',
        r.student_data?.email || 'N/A',
        r.student_data?.phone || 'N/A',
        `${r.student_data?.location_city || ''}, ${r.student_data?.location_country || ''}`,
        r.current_step || 'N/A',
        r.student_data?.coding_experience_level || 'N/A',
        r.student_data?.primary_motivation || 'N/A',
        r.student_data?.desired_outcome || 'N/A',
        r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : (r.updatedAt || 'N/A')
      ]);

      // 3. Write data
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId!,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers, ...rows]
        }
      });

      res.json({ success: true, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
    } catch (error) {
      console.error("Sheets Export Error:", error);
      res.status(500).json({ error: "Failed to export to Google Sheets" });
    }
  });

  // --- Configuration persistence for automated sync ---
  app.post('/api/admin/set-master-sheet', async (req, res) => {
    const { spreadsheetId, tokens } = req.body;
    try {
      const db = admin.firestore();
      await db.collection('platform_settings').doc('google_sheets').set({
        spreadsheetId,
        tokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to save master sheet settings", e);
      res.status(500).json({ error: "Storage failure" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

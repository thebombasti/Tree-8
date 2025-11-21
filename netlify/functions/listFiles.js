// Netlify Function to securely list files from a Google Drive folder
const { google } = require('googleapis');

// --- Google Service Account Setup (using Netlify Environment Variables) ---
// IMPORTANT: You must set the following environment variables in your Netlify settings.
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'); // Handle key formatting

// Initialize Google Auth (JWT/Service Account)
const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/drive.readonly'] // Read-only scope for listing
);

const drive = google.drive({ version: 'v3', auth });

exports.handler = async (event) => {
    // 1. Check for GET method
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    // 2. Get folderId from query parameters
    const folderId = event.queryStringParameters.folderId;

    if (!folderId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing folder ID query parameter.' }),
        };
    }

    // 3. Query Google Drive
    try {
        const q = `'${folderId}' in parents and trashed=false`;
        const response = await drive.files.list({
            q: q,
            fields: 'files(id, name, size, mimeType, createdTime, webViewLink)',
            pageSize: 100, // Fetch up to 100 files
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'File list retrieved successfully',
                files: response.data.files,
            }),
        };

    } catch (error) {
        console.error('Google Drive API List Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to retrieve file list from Google Drive.' }),
        };
    }
};

// Netlify Function to securely upload files to Google Drive
const { google } = require('googleapis');
const busboy = require('busboy');

// --- Google Service Account Setup (using Netlify Environment Variables) ---
// IMPORTANT: You must set the following environment variables in your Netlify settings.
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'); // Handle key formatting

// Initialize Google Auth (JWT/Service Account)
const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/drive.file'] // Scope for file access
);

const drive = google.drive({ version: 'v3', auth });

// Helper to parse multipart/form-data from the client request
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        // Netlify event body is base64 encoded for binary data
        const bodyBuffer = Buffer.from(event.body, 'base64');
        const boundary = event.headers['content-type'].split('; ')[1].replace('boundary=', '');

        const fields = {};
        let fileData;
        let fileName;
        let fileMimeType;

        const bb = busboy({ headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });

        bb.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        bb.on('file', (name, file, info) => {
            fileName = info.filename;
            fileMimeType = info.mimeType;
            const chunks = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => {
                fileData = Buffer.concat(chunks);
            });
        });

        bb.on('close', () => {
            if (!fileData) {
                return reject(new Error('No file uploaded.'));
            }
            resolve({ fields, fileData, fileName, fileMimeType });
        });

        bb.on('error', (err) => reject(err));

        bb.end(bodyBuffer);
    });
}

exports.handler = async (event) => {
    // 1. Check for POST method
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    // 2. Parse file data and fields
    let formData;
    try {
        formData = await parseMultipartForm(event);
    } catch (error) {
        console.error('Busboy parsing error:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Failed to process form data.' }),
        };
    }

    const { fields, fileData, fileName, fileMimeType } = formData;
    const folderId = fields.folderId;

    if (!folderId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing folder ID.' }),
        };
    }

    // 3. Upload file to Google Drive
    try {
        const fileMetadata = {
            name: fileName,
            parents: [folderId],
        };
        const media = {
            mimeType: fileMimeType,
            body: fileData,
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink'
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'File uploaded successfully',
                fileName: response.data.name,
                fileId: response.data.id,
                webViewLink: response.data.webViewLink
            }),
        };

    } catch (error) {
        console.error('Google Drive API Upload Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to upload file to Google Drive.' }),
        };
    }
};

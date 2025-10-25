// api/get-update-content.js

import { google } from 'googleapis';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'File ID is required.' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const fileRes = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' }
    );
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); 

    fileRes.data.pipe(res);

  } catch (error) {
    console.error(`Error fetching content for update file ID ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch update content.' });
  }
}

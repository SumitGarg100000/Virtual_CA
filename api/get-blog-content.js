// api/get-blog-content.js
import { google } from 'googleapis';

export default async function handler(req, res) {
  // URL se file ID lein (e.g., /api/get-blog-content?id=FILE_ID)
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

    // Drive se file ka content download karein
    const fileRes = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' } // Stream ke roop mein data lein
    );
    
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // 1 ghante ki caching

    // Stream ko seedha response mein bhej dein
    fileRes.data.pipe(res);

  } catch (error) {
    console.error(`Error fetching content for file ID ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch blog content.' });
  }
}

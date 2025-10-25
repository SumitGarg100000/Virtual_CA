// api/get-home-updates.js

import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Google Drive se files ki list fetch karein
    const driveResponse = await drive.files.list({
      // !!! IMPORTANT: Yeh naye 'Updates' folder se data laayega !!!
      q: `'${process.env.GOOGLE_DRIVE_UPDATES_FOLDER_ID}' in parents and trashed=false`,
      
      fields: 'files(id, name, createdTime, description)',
      orderBy: 'createdTime desc',
    });

    const files = driveResponse.data.files;
    if (!files || files.length === 0) {
      return res.status(200).json([]);
    }

    // Files ko aasaan format mein badlein
    const updates = files.map(file => {
      
      let title;
      if (file.description) {
        title = file.description;
      } else {
        title = file.name.split('_').slice(0, -1).join(' ').replace('.md', '');
      }

      return {
        id: file.id,
        title: title || "Untitled Update",
        createdDate: new Date(file.createdTime).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      };
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); 
    
    return res.status(200).json(updates);

  } catch (error) {
    console.error('Error fetching updates list:', error);
    return res.status(500).json({ error: 'Failed to fetch updates list.' });
  }
}

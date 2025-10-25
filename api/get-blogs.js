// api/get-blogs.js

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
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
      
      // IMPORTANT: Ab hum 'description' field ko bhi request kar rahe hain
      fields: 'files(id, name, createdTime, description)',
      
      orderBy: 'createdTime desc',
    });

    const files = driveResponse.data.files;
    if (!files || files.length === 0) {
      return res.status(200).json([]);
    }

    // Files ko aasaan format mein badlein
    const blogs = files.map(file => {
      
      // --- YEH HAI NAYA TITLE LOGIC ---
      let title;
      if (file.description) {
        // Step 1: Koshish karo ki title 'description' field se mil jaaye
        title = file.description;
      } else {
        // Step 2: Agar nahi milta (purani files), toh filename wala purana logic use karo
        title = file.name.split('_').slice(0, -1).join(' ').replace('.md', '');
      }
      // --- NAYA LOGIC KHATAM ---

      return {
        id: file.id,
        title: title || "Untitled Blog", // Yahan ab sahi title aayega
        createdDate: new Date(file.createdTime).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      };
    });

    // CORS Headers add karein taaki Vercel se bahar bhi access ho sake
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); // 1 minute ki caching
    
    return res.status(200).json(blogs);

  } catch (error) {
    console.error('Error fetching blog list:', error);
    return res.status(500).json({ error: 'Failed to fetch blog list.' });
  }
}

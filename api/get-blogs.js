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
      // Folder ID environment variable se lein
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
      // Humein file ki ID, Naam, aur banne ka time chahiye
      fields: 'files(id, name, createdTime)',
      // Sabse nayi file sabse upar
      orderBy: 'createdTime desc',
    });

    const files = driveResponse.data.files;
    if (!files || files.length === 0) {
      return res.status(200).json([]);
    }

    // Files ko aasaan format mein badlein
    const blogs = files.map(file => {
      // Filename se Title nikaalein (underscore ko space se badlein)
      const title = file.name.split('_').slice(0, -1).join(' ').replace('.md', '');
      return {
        id: file.id,
        title: title || "Untitled Blog", // Agar title na mile
        // Date ko aasaan format mein badlein (e.g., "22 October 2025")
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


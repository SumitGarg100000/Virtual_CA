// api/generate-blog.js (FINAL & CLEAN VERSION)

import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  
  // Security Check: URL se secret code check karein
  if (req.query.cron_secret !== process.env.CRON_SECRET) {
    console.warn('Unauthorized attempt to run blog generator.');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('Blog generator job started...');

  try {
    // Step 1: Google Drive Authentication
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000' // Redirect URI is required but not used here
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Step 2: Select a Topic (Future: Use Google Search API)
    const topics = [
      "Future of Auditing with AI in India",
      "Understanding the latest changes in TDS regulations",
      "How CAs can leverage technology for better client service",
      "Decoding Angel Tax Updates for Startups in India",
      "Key considerations for filing GSTR-9 and GSTR-9C",
    ];
    const latestTopic = topics[Math.floor(Math.random() * topics.length)];

    // Step 3: Generate Blog with Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      Act as an expert Chartered Accountant in India. Write a blog article on the topic: "${latestTopic}".
      Instructions:
      1.  **Target Audience:** Indian Taxpayers and CAs.
      2.  **Tone:** Professional and informative, using simple Hinglish where appropriate.
      3.  **Format:** Use Markdown. Use headings (##), sub-headings (###), and bullet points (*). Bold important terms using **term**.
      4.  **Content:** Explain the topic in detail (~500-700 words). Include what, why, who is affected, deadlines (if any), and impact. Provide a simple example if possible.
      5.  **Crucial:** The very first line MUST be the title in an H1 heading (starting with '# ').
      6.  **Mandatory:** End the article with the publication date. Example: *Published on: 22 October 2025*
    `;
    
    const result = await model.generateContent(prompt);
    let blogContent = await result.response.text();

    if (!blogContent || !blogContent.startsWith('# ')) {
        throw new Error("Gemini did not return valid content.");
    }
    
    // Add publication date if missing
    if (!blogContent.includes('*Published on:')) {
        const currentDateStr = new Date().toLocaleString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        blogContent += `\n\n*Published on: ${currentDateStr}*`;
    }
    
    const title = blogContent.split('\n')[0].replace('# ', '').trim();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const fileName = `${sanitizedTitle.substring(0, 50)}_${Date.now()}.md`;

    // Step 4: Save to Google Drive
    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      mimeType: 'text/markdown',
    };
    const media = { mimeType: 'text/markdown', body: blogContent };
    
    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });
    
    console.log(`✅ Blog article created: ${driveResponse.data.name}`);
    res.status(200).json({ success: true, message: 'Blog generated successfully!', file: driveResponse.data });

  } catch (error) {
    console.error('❌ Error in blog generator:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}


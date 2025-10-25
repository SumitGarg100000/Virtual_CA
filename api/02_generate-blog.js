// api/generate-blog.js (FINAL & ULTRA-SMART v2)

import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  
  // Security Check
  if (req.query.cron_secret !== process.env.CRON_SECRET) {
    console.warn('Unauthorized attempt to run blog generator.');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('Ultra-smart blog generator v2 job started...');

  try {
    // --- Step 1: Initialize APIs (Drive & Gemini) ---
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelWithSearch = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        tools: [{ "google_search": {} }],
    });

    // --- Step 2: Gemini se Latest Analytical Topic Dhoondhwao ---
    const topicFinderPrompt = `
      Search for the most significant and recent (last 7-10 days) legal or tax updates in India relevant to Chartered Accountants, CS, and Corporate Lawyers.
      Prioritize topics that involve analysis, such as:
      - A major Supreme Court or High Court judgment (e.g., on GST, Income Tax).
      - A new, complex circular or notification from CBIC, CBDT, or MCA.
      - A significant amendment to a law (e.g., Companies Act, Income Tax Act).
      - An official clarification (FAQ) on a confusing provision.

      STRICTLY EXCLUDE simple news like due date extensions, basic compliance reminders, or general economic news.
      
      From the search results, select the single most impactful topic that requires deep analysis.
      
      Your final output MUST be ONLY the chosen topic as a single, concise line. For example: "Analysis of the recent Supreme Court judgment on GST input tax credit".
    `;

    console.log('Finding a high-value topic using Gemini with Google Search...');
    const topicResult = await modelWithSearch.generateContent(topicFinderPrompt);
    const latestTopic = (await topicResult.response.text()).trim();

    if (!latestTopic || latestTopic.length < 15) {
        throw new Error("Could not find a suitable high-value topic from Google Search.");
    }
    console.log(`High-Value Topic Found: "${latestTopic}"`);

    // --- Step 3: Gemini se Found Topic par Original Blog Likhwao (Updated Prompt) ---
    const blogWriterPrompt = `
      You are an experienced Chartered Accountant in India with excellent writing skills. Your task is to write an original, insightful, and human-like blog article on the topic: "${latestTopic}".

      **Core Directive: DO NOT copy-paste from search results. Your goal is to analyze, synthesize, and explain the information in your own unique words. The content must be original and pass plagiarism checks.**

      **Instructions:**
      1.  **Persona & Tone:** Write as a real person. Use an engaging, professional yet approachable tone. Imagine you are explaining this complex topic to a fellow professional. Use Hinglish only where it genuinely simplifies a concept.
      2.  **Target Audience:** Chartered Accountants, CS, Lawyers, and Indian business owners.
      3.  **Format:** Use Markdown. Structure the article with a main heading (#), logical sub-headings (##, ###), and bullet points (*) for clarity. Bold important terms (**term**).
      4.  **Content (unlimited words):**
          * **Introduction:** Hook the reader by explaining why this topic is important right now.
          * **Analysis:** Don't just state the facts. Explain the 'what', 'why', and 'how'. **Crucially, wherever possible, mention important dates (e.g., "This notification, dated [date], will be effective from [date]...", "The judgment was delivered on [date]...").**
          * **Comparison (if applicable):** If it's an amendment, create a simple Markdown table comparing the Old Provision vs. the New Provision.
          * **Examples:** Include 1-2 practical, real-world examples to make complex scenarios easy to understand.
          * **Conclusion:** Summarize the key takeaways and provide actionable advice for professionals.
      5.  **Crucial:** The very first line of your output MUST be an engaging, SEO-friendly article title in an H1 heading (e.g., '# Decoding the Latest Supreme Court Ruling on GST').
      6.  **Do NOT add a 'Published on' date yourself.** The system will add it automatically.
    `;
    
    console.log('Generating original, human-like blog content with date mentions...');
    const blogResult = await modelWithSearch.generateContent(blogWriterPrompt);
    let blogContent = await blogResult.response.text();

    if (!blogContent || !blogContent.startsWith('# ')) {
        throw new Error("Gemini did not return valid blog content.");
    }

    // --- Step 3.5: Fix Duplicate Date Issue ---
    // Pehle, Gemini ke output se koi bhi "Published on" line hata do
    blogContent = blogContent.replace(/^\*Published on:.*$/gm, '').trim();

    // Ab, hamesha aakhir mein apni taraf se sahi current date add karo
    const currentDateStr = new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
    });
    blogContent += `\n\n*Published on: ${currentDateStr}*`;
    
    // --- Step 4: File Save Karne ka Logic (waisa hi rahega) ---
    const title = blogContent.split('\n')[0].replace('# ', '').trim();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const fileName = `${sanitizedTitle.substring(0, 50)}_${Date.now()}.md`;

    const fileMetadata = { name: fileName, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], mimeType: 'text/markdown' };
    const media = { mimeType: 'text/markdown', body: blogContent };
    
    const driveResponse = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name' });
    
    console.log(`✅ Original blog article (v2) created: ${driveResponse.data.name}`);
    res.status(200).json({ success: true, message: 'Blog generated successfully!', file: driveResponse.data });

  } catch (error) {
    console.error('❌ Error in smart blog generator:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}


// api/generate-home-updates.js (v1.1 - Added JSON cleaning)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { put, list, del } from '@vercel/blob';
import axios from 'axios';

const BLOB_FILENAME = 'latest-updates.json';
const MAX_UPDATES = 25;

export default async function handler(req, res) {

  if (req.query.cron_secret !== process.env.CRON_SECRET) {
    console.warn('Unauthorized attempt to run updates generator.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Latest updates generator job started...');

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelWithSearch = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        tools: [{ "google_search": {} }],
        generation_config: { response_mime_type: "application/json" },
    });

    const updateFinderPrompt = `
      Search for the absolute latest (last 1-2 days) news updates, circulars, notifications, advisories, or important clarifications relevant ONLY to Chartered Accountants, Company Secretaries, and Corporate Lawyers in India.
      Use official sources like incometaxindia.gov.in, cbic.gov.in, mca.gov.in, pib.gov.in, major tax portals like Taxmann, TaxGuru, and top financial news sites (Livemint, Economic Times - Business/Tax sections).
      STRICTLY EXCLUDE: Simple due date extensions, general economic news, old news, seminars, webinars, or job postings.
      For each relevant update found (aim for 5-10 recent ones), provide the following details in a JSON array format:
      1.  "headline": The main headline of the update.
      2.  "description": A very brief summary (max 15-20 words) explaining the core point.
      3.  "link": The direct URL to the source if possible (use null if none).
      Your final output MUST be ONLY the JSON array string. Example:
      [ { "headline": "...", "description": "...", "link": "..." }, { ... } ]
    `;

    console.log('Finding latest updates using Gemini...');
    const result = await modelWithSearch.generateContent(updateFinderPrompt);
    const responseText = await result.response.text();

    let newUpdates = [];
    try {
        // --- FIX: Clean the response text before parsing ---
        let cleanedResponseText = responseText.trim();
        if (cleanedResponseText.startsWith('```json')) {
            cleanedResponseText = cleanedResponseText.substring(7); // Remove ```json
        }
        if (cleanedResponseText.endsWith('```')) {
            cleanedResponseText = cleanedResponseText.substring(0, cleanedResponseText.length - 3); // Remove ```
        }
        cleanedResponseText = cleanedResponseText.trim();
        // --- END FIX ---

        newUpdates = JSON.parse(cleanedResponseText); // Parse cleaned text
        if (!Array.isArray(newUpdates)) throw new Error("Parsed data is not an array");
        console.log(`Found ${newUpdates.length} potential new updates.`);
    } catch (parseError) {
        console.error("Error parsing JSON response from Gemini:", responseText);
        throw new Error(`Failed to parse updates from Gemini. Original response: ${responseText}`);
    }

    newUpdates = newUpdates.filter(update =>
        !/deadline|due date|extended|extension/i.test(update.headline) &&
        !/deadline|due date|extended|extension/i.test(update.description)
    );
    console.log(`Filtered out due date extensions, ${newUpdates.length} updates remain.`);

    if (newUpdates.length === 0) {
        console.log("No relevant new updates found.");
        return res.status(200).json({ success: true, message: 'No new updates found.' });
    }

    let existingUpdates = [];
    try {
        console.log(`Fetching existing updates from Blob: ${BLOB_FILENAME}`);
        const blobList = await list({ prefix: BLOB_FILENAME, limit: 1 });
        if (blobList.blobs.length > 0) {
            const blobUrl = blobList.blobs[0].url;
            const response = await axios.get(blobUrl);
            if (response.data && Array.isArray(response.data)) {
                existingUpdates = response.data;
                console.log(`Fetched ${existingUpdates.length} existing updates.`);
            } else { console.warn("Existing blob data invalid."); }
        } else { console.log("No existing updates blob found."); }
    } catch (error) {
        if (!(error.response && error.response.status === 404)) {
             console.warn("Could not fetch/parse existing updates. Error:", error.message);
        } else { console.log("No existing updates blob found (404).");}
        existingUpdates = [];
    }

    const existingHeadlines = new Set(existingUpdates.map(u => u.headline.trim().toLowerCase()));
    const updatesToAdd = newUpdates.filter(nu => nu.headline && !existingHeadlines.has(nu.headline.trim().toLowerCase())); // Check nu.headline exists
    
    console.log(`Adding ${updatesToAdd.length} unique new updates.`);
    if (updatesToAdd.length === 0) {
        return res.status(200).json({ success: true, message: 'No unique new updates to add.' });
    }

    let combinedUpdates = [...updatesToAdd, ...existingUpdates];
    if (combinedUpdates.length > MAX_UPDATES) {
        combinedUpdates = combinedUpdates.slice(0, MAX_UPDATES);
         console.log(`Updates list truncated to ${MAX_UPDATES}.`);
    }

    combinedUpdates = combinedUpdates.map(u => ({ ...u, fetchedAt: u.fetchedAt || Date.now() }));

    console.log(`Uploading ${combinedUpdates.length} updates to Blob: ${BLOB_FILENAME}`);
    const blobResult = await put(BLOB_FILENAME, JSON.stringify(combinedUpdates, null, 2), {
      access: 'public',
      contentType: 'application/json',
      cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
    });

    console.log(`✅ Updates stored in Blob: ${blobResult.url}`);
    res.status(200).json({ success: true, message: `Updates processed. Added ${updatesToAdd.length} new updates.`, blobUrl: blobResult.url });

  } catch (error) {
    console.error('❌ Error in updates generator:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

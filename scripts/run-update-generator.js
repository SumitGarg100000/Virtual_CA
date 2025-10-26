// scripts/run-update-generator.js (v3.1 - Robust Parsing & Better Prompts)

import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Helper function to get current date formatted
function getCurrentDateFormatted() {
    return new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
    });
}

// Helper function to handle potential Gemini errors gracefully
async function safeGenerateContent(model, prompt) {
    try {
        const result = await model.generateContent(prompt);
        // Check if response exists AND if there are candidates with content
        if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0 || !result.response.candidates[0].content || !result.response.candidates[0].content.parts || result.response.candidates[0].content.parts.length === 0) {
           console.error("Gemini returned no response, was blocked, or had empty content for prompt:", prompt);
           console.error("Full Gemini Result (if any):", JSON.stringify(result, null, 2));
           // Check for specific block reason if available
           if (result && result.response && result.response.promptFeedback && result.response.promptFeedback.blockReason) {
               console.error("Block Reason:", result.response.promptFeedback.blockReason);
           }
           return null; // Indicate failure or block
        }
        // Safely access the text part
        return await result.response.text(); // Use the built-in text() method for safety
    } catch (error) {
        console.error("Error during Gemini generateContent call:", error);
        // Log specific error details if available (e.g., status code)
        if (error.response) {
            console.error("API Response Status:", error.response.status);
            console.error("API Response Data:", error.response.data);
        }
        return null; // Indicate API call failure
    }
}


// --- MAIN FUNCTION ---
async function generateUpdate() {
    console.log('Update generator script (v3.1) started...'); // Version updated

    try {
        // --- Security Check ---
        if (!process.env.CRON_SECRET || process.env.CRON_SECRET === "YOUR_SECRET_HERE") {
             console.warn('CRON_SECRET is not set or is using a placeholder.');
             // process.exit(1); // Keep commented unless strictly needed
        }

        // --- Initialize APIs (Drive & Gemini) ---
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:3000' // Placeholder
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const modelWithSearch = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ "google_search": {} }],
        });

        // --- Fetch Existing Titles for Duplicate Check ---
        let existingTitles = [];
        try {
            console.log('Fetching existing updates for duplicate check...');
            const driveResponse = await drive.files.list({
                q: `'${process.env.GOOGLE_DRIVE_UPDATES_FOLDER_ID}' in parents and trashed=false`,
                fields: 'files(description)',
                orderBy: 'createdTime desc',
                pageSize: 20 // Check last 20 updates
            });

            if (driveResponse.data.files && driveResponse.data.files.length > 0) {
                existingTitles = driveResponse.data.files
                    .map(file => file.description)
                    .filter(Boolean);
                console.log(`Found ${existingTitles.length} existing titles to avoid.`);
            } else {
                 console.log('No existing update files found in the folder.');
            }
        } catch (listError) {
            console.warn('Could not fetch existing updates list, proceeding without duplicate check.', listError.message);
            existingTitles = []; // Proceed without check if Drive fails
        }
        // --- Duplicate Check Fetch END ---

        // --- Generate Strict Topic Finder Prompt ---
        const currentDate = getCurrentDateFormatted();
        const topicFinderPrompt = `
         **Current Date:** ${currentDate}.
         **HIGHEST PRIORITY: ACCURACY & RECENCY.** Find VERIFIABLY recent official updates. Do NOT invent or assume.

         **STEPS:**
         1. **MANDATORY:** Use the Google Search tool to find official announcements (Notifications, Circulars, Advisories, Press Releases) in India relevant to Chartered Accountants & CS published **strictly within the last 1-2 days FROM ${currentDate}**.
         2. **VERIFICATION (CRITICAL):** For **ANY potential topic**, first try to find and **verify the core facts** (dates, numbers) directly on **official government websites** (incometaxindia.gov.in, cbic.gov.in, mca.gov.in, pib.gov.in). This is the BEST source.
         3. If an official source confirms it, GREAT.
         4. If an official source is hard to find directly via search *but* the update (like a **common Due Date Extension**) is widely reported across **multiple reputable** tax portals (TaxGuru, Taxmann etc.), you can **cautiously accept** it, but clearly state the *reported* details. **Prioritize official verification whenever possible.**
         5. **DATE FILTER:** The verified or widely reported publication date MUST be within the last 1-2 days from ${currentDate}.
         6. **REJECT** any topic if:
             * It cannot be verified via official sources OR multiple reputable portals.
             * Its verified/reported date is outside the 1-2 day timeframe.
             * It seems uncertain, speculative, or requires major assumptions.
         7. **PRIORITIZE verified topics like:**
             * **Due Date Extensions (High Priority)**.
             * New official advisories.
            * Simple official circulars/notifications.
         8. **STRICTLY EXCLUDE:**
             * Unverified/Older topics (outside 1-2 days).
             * Topics already in this list: ${JSON.stringify(existingTitles)} // <-- DUPLICATE CHECK IS HERE
             * Complex judgments, deep analysis articles, seminars, general news.
         9. Select the single most important **VERIFIED or Widely Reported, NEW, and RECENT** topic satisfying all conditions.
     10. If NO such topic is found after thorough verification, output **ONLY** the text "NO_NEW_VERIFIED_UPDATES_FOUND". // <-- CORRECT TEXT

         **OUTPUT:**
         Your final output MUST be ONLY the single-line title for the selected topic, including the verified/reported source's publication date.
         Example 1 (Official): "CBDT Extends TDS Return Due Date for Q2 FY25-26 (Notification 90/2025 dated Oct 22, 2025)"
         Example 2 (Widely Reported): "GSTR-3B Due Date for Oct 2025 Reportedly Extended to Nov 25th (As reported Oct 23, 2025)"
        `;

        console.log('Finding a high-value update topic using Gemini...');
       const latestTopicRaw = await safeGenerateContent(modelWithSearch, topicFinderPrompt);

        if (latestTopicRaw === null) {
            // safeGenerateContent already logged the error
            throw new Error("Gemini call failed or was blocked during topic finding.");
        }

        const latestTopic = latestTopicRaw.trim();

        // --- Check if a valid topic was found ---
       if (latestTopic === "NO_NEW_VERIFIED_UPDATES_FOUND" || latestTopic.length < 15) { // <-- CORRECT CHECK
            console.log("No unique new VERIFIED updates found based on Gemini response or length check.");
            process.exit(0); // Exit gracefully
        }

        // --- Log the found topic ---
        console.log(`High-Value Update Topic Found: "${latestTopic}"`); // <-- LOGGING IS BACK

        // --- Generate Content for the Found Topic ---
        const blogWriterPrompt = `
         You are an expert Indian Chartered Accountant. Your task is to write a **short, clear, and factual update post** (like a mini-blog) on the topic: "${latestTopic}".

         **Core Directive: This is a fast update, not a deep blog. Be 100% original, clear, and to-the-point.**

         **1. Sourcing & Links (CRITICAL RULE):**
         * **Research:** Use Google Search to find the *most relevant official page* for this topic.
       * **No Third-Party Citations:** DO NOT link to or mention TaxGuru, Taxmann, etc.
         * **Link Priority (CRITICAL):**
           * 1. **(BEST)** The direct official PDF link (e.g., from egazette.nic.in or cbic.gov.in).
           * 2. **(GOOD)** If the direct PDF cannot be found, link to the *official Press Release (PIB)* or the main *'Notifications' section* of the relevant ministry's website (e.g., 'https://cbic.gov.in/notifications').
           * 3. **(LAST RESORT)** If no specific link is found, link to the ministry's homepage (e.g., 'https://incometaxindia.gov.in/').
         * **CRITICAL:** **NEVER** invent (hallucinate) a link. If you cannot find a link from Priority 1 or 2, use Priority 3.

         **2. Persona & Tone (FOR HUMAN-LIKE WRITING):**
         * Be a helpful colleague. Use a professional but conversational tone.
         * **Hinglish is ALLOWED** (Roman script only). e.g., "Toh, date extend ho gayi hai."
         * **Pure Hindi is NOT ALLOWED** (Devanagari script).

         **3. Content & Structure (SHORT & Factual):**
       * **Article Title (First Line):** MUST be an H1 tag (#). Rephrase the topic slightly if needed for flow. (e.g., \`# ${latestTopic}\`).
         * **Introduction (1-2 lines):** "Ek important update hai. Government ne [TOPIC] ke liye [KYA KIYA HAI] announce kiya hai."
         * **Main Body (Bullet Points):** Clearly explain the 'what' and 'why'.
           * e.g., "**Old Due Date:** [Old Date]"
       * e.g., "**New Due Date:** [New Date]"
           * Mention the Notification/Circular number and date **accurately**.
         * **Official Sources (Mandatory):** End with exactly this format (replace with the real link found during research):
           \`## Read the Official Document\`
           \`* [Download the Official Notification/Circular here](LINK_TO_GOV_PAGE_OR_PDF)\`

          **4. OUTPUT FORMATTING (CRITICAL):**
         * **START IMMEDIATELY:** Your response MUST start *directly* with the H1 tag (the '#' character).
         * **NO PREAMBLE:** Do NOT include *any* preamble, conversational text, thinking process, or any text like "Here's the plan..." or "I found the link..." before the H1 tag.

         **5. Exclusions:**
         * Do NOT add a 'Published on' date.
        `;

        console.log('Generating original, human-like update content...');
        const blogContentRaw = await safeGenerateContent(modelWithSearch, blogWriterPrompt);

    if (blogContentRaw === null) {
            // safeGenerateContent already logged the error
            throw new Error("Gemini call failed or was blocked during content writing.");
        }

        // --- NEW: Clean the response and find the start of the article ---
     // Find the index of the *first* H1 tag (which is '# ')
        const h1Index = blogContentRaw.indexOf('# ');

        if (!blogContentRaw || h1Index === -1) {
            // The response is empty OR the H1 tag is missing completely
            console.error("Invalid update content received (empty or no H1 tag found):", blogContentRaw);
            throw new Error("Gemini did not return valid update content (missing '# ').");
        }

        // Slice the content from the H1 tag onwards, trimming any leading whitespace
     let blogContent = blogContentRaw.substring(h1Index).trim();
        // --- END OF NEW CODE ---

        // --- Add Current Date ---
        blogContent = blogContent.replace(/^\*Published on:.*$/gm, '').trim();
     const currentDateStr = new Date().toLocaleString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        blogContent += `\n\n*Published on: ${currentDateStr}*`;

        // --- File Save Logic ---
        const title = blogContent.split('\n')[0].replace('# ', '').trim();
     // Use the generated title for duplicate check, not potentially hallucinated filename part
        console.log(`Using generated title for description: "${title}"`);

        // Check against existing titles again just before saving (belt-and-suspenders)
        if (existingTitles.includes(title.toLowerCase())) {
             console.warn(`Duplicate title found just before saving: "${title}". Skipping save.`);
        process.exit(0); // Exit gracefully, already exists
        }


        const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const fileName = `${sanitizedTitle.substring(0, 50)}_${Date.now()}.md`;

        const fileMetadata = {
            name: fileName,
       parents: [process.env.GOOGLE_DRIVE_UPDATES_FOLDER_ID],
            mimeType: 'text/markdown',
            description: title // Store the clean title for future duplicate checks
        };
        const media = { mimeType: 'text/markdown', body: blogContent };

     console.log(`Attempting to save file: ${fileName} to Drive folder ID: ${process.env.GOOGLE_DRIVE_UPDATES_FOLDER_ID}`);
        const driveResponse = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name' });

        console.log(`✅ Update article created successfully: ${driveResponse.data.name} (ID: ${driveResponse.data.id})`);
        process.exit(0); // Success

    } catch (error) {
     console.error('❌ Error in update generator script:', error.message);
        if (error.stack) {
           console.error('Stack trace:', error.stack);
        }
        process.exit(1); // Indicate failure to GitHub Actions
    }
}

// --- Run the main function ---
generateUpdate();

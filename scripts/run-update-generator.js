// scripts/run-update-generator.js (v3.2 - Strict Finder/Writer)

import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Helper function to get current date formatted
function getCurrentDateFormatted() {
    return new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' // Fixed typo
    });
}

// Helper function to handle potential Gemini errors gracefully
async function safeGenerateContent(model, prompt) {
    try {
        const result = await model.generateContent(prompt);
        // Check for empty or blocked response
        if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0 || !result.response.candidates[0].content || !result.response.candidates[0].content.parts || result.response.candidates[0].content.parts.length === 0) {
           console.error("Gemini returned no response, was blocked, or had empty content for prompt:", prompt);
           if (result && result.response && result.response.promptFeedback && result.response.promptFeedback.blockReason) {
               console.error("Block Reason:", result.response.promptFeedback.blockReason);
           }
           return null;
        }
        return await result.response.text();
    } catch (error) {
        console.error("Error during Gemini generateContent call:", error);
        if (error.response) {
            console.error("API Response Status:", error.response.status);
            console.error("API Response Data:", error.response.data);
        }
        return null;
    }
}


// --- MAIN FUNCTION ---
async function generateUpdate() {
    console.log('Update generator script (v3.2) started...');

    try {
        // --- Security Check ---
        if (!process.env.CRON_SECRET || process.env.CRON_SECRET === "YOUR_SECRET_HERE") {
             console.warn('CRON_SECRET is not set or is using a placeholder.');
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

        // --- MODEL 1: The "Finder" (Dumb Search Agent) ---
        // This model's ONLY job is to search and report raw results.
        const modelFinder = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ "google_search": {} }],
            generation_config: { response_mime_type: "application/json" },
        });

        // --- MODEL 2: The "Writer" (Dumb Summarizer) ---
        // This model has NO search tools. It can only summarize.
        const modelWriter = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            // NO TOOLS HERE. This is the key to stopping hallucinations.
        });
        // --- END MODEL DEFINITIONS ---


        // --- Fetch Existing Titles for Duplicate Check ---
        let existingTitles = [];
        try {
            console.log('Fetching existing updates for duplicate check...');
            const driveResponse = await drive.files.list({
                q: `'${process.env.GOOGLE_DRIVE_UPDATES_FOLDER_ID}' in parents and trashed=false`,
                fields: 'files(description)',
                orderBy: 'createdTime desc',
                pageSize: 20
            });

            if (driveResponse.data.files && driveResponse.data.files.length > 0) {
                existingTitles = driveResponse.data.files
                    .map(file => file.description ? file.description.toLowerCase().trim() : '')
                    .filter(Boolean);
                console.log(`Found ${existingTitles.length} existing titles to avoid.`);
            } else {
                 console.log('No existing update files found in the folder.');
            }
        } catch (listError) {
            console.warn('Could not fetch existing updates list, proceeding without duplicate check.', listError.message);
            existingTitles = [];
        }
        const existingTitlesSet = new Set(existingTitles);
        // --- Duplicate Check Fetch END ---


        // --- STEP 1: Find Topics ---
        const currentDate = getCurrentDateFormatted();
        // --- CHANGE: New prompt to force RAW search results ---
        const topicFinderPrompt = `
        **Task:** You are an automated search agent.
        **Current Date:** ${currentDate}.
        **Goal:** Find the most recent (last 1-2 days) news for CAs in India (GST, Income Tax, MCA).

        **STEPS (MANDATORY):**
        1.  **MANDATORY:** Execute Google Searches using queries like "latest GST notification", "latest Income Tax circular", "MCA press release", "CBIC advisory", "CBDT circular".
        2.  **Filter:** Look *only* for results from **official government websites** (incometaxindia.gov.in, cbic.gov.in, mca.gov.in, pib.gov.in) OR **highly reputable tax portals** (taxguru.in, taxmann.com).
        3.  **Recency:** The search result's date must be within the last 2 days from ${currentDate}.
        4.  **Format:** Return a JSON array of the **raw search results** that match.
        
        **JSON Output Structure (MUST follow):**
        Return a JSON array where each object has:
        -   "title": The literal title from the search result.
        -   "snippet": The snippet from the search result.
        -   "source_url": The direct URL from the search result.
        
        **CRITICAL RULE:**
        * **DO NOT INVENT or "create" a headline.** Only report the literal "title" you found.
        * **DO NOT INVENT a "description".** Only report the "snippet".
        * **DO NOT INVENT a "link".** Only report the "source_url".
        * If no verifiable results are found, return an empty array \`[]\`.
        `;
        
        console.log('Finding raw update topics using Gemini (JSON search mode)...');
        const latestTopicRaw = await safeGenerateContent(modelFinder, topicFinderPrompt);

        if (latestTopicRaw === null) {
            throw new Error("Gemini call failed or was blocked during topic finding.");
        }

        // --- Parse the JSON response ---
        let foundTopics = [];
        try {
            let cleanedResponseText = latestTopicRaw.trim();
            if (cleanedResponseText.startsWith('```json')) cleanedResponseText = cleanedResponseText.substring(7);
            if (cleanedResponseText.endsWith('```')) cleanedResponseText = cleanedResponseText.substring(0, cleanedResponseText.length - 3);
            cleanedResponseText = cleanedResponseText.trim();
            if (cleanedResponseText === "") cleanedResponseText = "[]";

            foundTopics = JSON.parse(cleanedResponseText);
            if (!Array.isArray(foundTopics)) throw new Error("Parsed data is not an array");
            console.log(`Gemini found ${foundTopics.length} potential topics.`);
        } catch (parseError) {
            console.error("Error parsing JSON response from Gemini:", latestTopicRaw);
            throw new Error(`Failed to parse updates from Gemini. Original response: ${latestTopicRaw}`);
        }
        
        // --- Find the first *new* topic from the list ---
        const newTopic = foundTopics.find(topic =>
            topic.title && topic.source_url && !existingTitlesSet.has(topic.title.toLowerCase().trim())
        );

        if (!newTopic) {
            console.log("No unique new VERIFIED updates found after filtering duplicates.");
            process.exit(0); // Exit gracefully
        }

        const topicTitle = newTopic.title.trim();
        const topicSnippet = newTopic.snippet ? newTopic.snippet.trim() : "No summary available.";
        const topicUrl = newTopic.source_url;

        console.log(`High-Value Update Topic Selected: "${topicTitle}"`);
        console.log(`Source URL: ${topicUrl}`);
        // --- END STEP 1 ---


        // --- STEP 2: Write Blog ---
        // --- CHANGE: New prompt that ONLY uses the info from Step 1 ---
        const blogWriterPrompt = `
         You are an expert Indian CA. Your task is to write a short, factual blog post.
         
         **STRICT RULE: DO NOT INVENT ANY INFORMATION. DO NOT SEARCH.**
         You MUST base your entire article *only* on the information provided below.
         
         **Source Information:**
         * **Headline:** "${topicTitle}"
         * **Summary:** "${topicSnippet}"
         * **Source URL:** ${topicUrl}

         **Instructions:**
         1.  **Title:** Your blog title MUST be an H1 tag (\`#\`) using the *exact* headline:
             \`# ${topicTitle}\`
         
         2.  **Introduction:** Write 1-2 lines (Hinglish is OK) introducing the topic based on the headline.
             (e.g., "Ek important update hai. ${topicTitle} ke baare mein ek nayi jaankari aayi hai.")
         
         3.  **Body:**
             * Write a few bullet points explaining the update.
             * Use *only* the facts available in the **Summary** ("${topicSnippet}").
             * **DO NOT** add any new dates, numbers, or section codes unless they are explicitly in the summary.
             * **DO NOT** invent a "Circular Number" or "Notification Date". If the summary has it, use it. If not, DO NOT add it.
         
         4.  **Official Source (Mandatory):** End the article by linking to the *exact* URL provided.
             \`## Read the Full Update\`
             \`* [Read the original source here](${topicUrl})\`
        
         **Exclusions:**
         * Do not add "Published on:".
         * Do not mention TaxGuru, Taxmann, etc. (even if the URL is from there).
        `;
        
        console.log('Generating original, human-like update content (No-Search mode)...');
        const blogContentRaw = await safeGenerateContent(modelWriter, blogWriterPrompt);

        if (blogContentRaw === null) {
            throw new Error("Gemini call failed or was blocked during content writing.");
        }

        let blogContent = blogContentRaw;

        if (!blogContent || !blogContent.startsWith('# ')) {
            console.error("Invalid update content received (doesn't start with #):", blogContent);
            throw new Error("Gemini did not return valid update content starting with '# '.");
        }

        // --- Add Current Date ---
        blogContent = blogContent.replace(/^\*Published on:.*$/gm, '').trim();
        const currentDateStr = new Date().toLocaleString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        blogContent += `\n\n*Published on: ${currentDateStr}*`;
        // --- END STEP 2 ---


        // --- File Save Logic ---
        const title = blogContent.split('\n')[0].replace('# ', '').trim();
        console.log(`Using generated title for description: "${title}"`);

        // Final duplicate check
        if (existingTitlesSet.has(title.toLowerCase().trim())) {
             console.warn(`Duplicate title found just before saving: "${title}". Skipping save.`);
             process.exit(0);
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

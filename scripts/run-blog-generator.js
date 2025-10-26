// scripts/run-blog-generator.js (v3.1 - Robust Parsing & Better Prompts)

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
async function generateBlog() {
    console.log('Blog generator script (v3.1) started...');

    try {
        // --- Security Check ---
        if (!process.env.CRON_SECRET || process.env.CRON_SECRET === "YOUR_SECRET_HERE") {
             console.warn('CRON_SECRET is not set or is using a placeholder.');
             // process.exit(1); // Uncomment to exit if secret is mandatory
        }

        // --- Initialize APIs (Drive & Gemini) ---
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:3000' // Redirect URI isn't typically used here
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Use the correct ENV var name
        const modelWithSearch = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ "google_search": {} }],
        });


        // --- Gemini se Latest Analytical Topic Dhoondhwao ---
        const currentDate = getCurrentDateFormatted(); // Get current date
        const topicFinderPrompt = `
         **Current Date:** ${currentDate}.
         **HIGHEST PRIORITY: ACCURACY & RECENCY.** Do NOT invent, assume, or select outdated topics.

         **STEPS:**
         1. **MANDATORY:** Use the Google Search tool to find significant legal/tax updates in India relevant to CAs/CSs published **strictly within the last 7-10 days FROM ${currentDate}**. Use all sources for research.
         2. **VERIFICATION (CRITICAL):** For any potential topic (judgment, circular, amendment), verify the core facts and **publication/judgment date** across **multiple reliable sources** (official sites, reputable legal portals). Do NOT rely on a single source.
         3. **DATE FILTER:** The verified publication/judgment date MUST be within the last 7-10 days from ${currentDate}.
         4. **REJECT** any topic if:
            - It cannot be reliably verified across multiple sources.
            - Its verified date is outside the required timeframe.
            - It requires significant assumptions.
         5. **PRIORITIZE verified, recent topics involving deep analysis, such as:**
            - Major Supreme Court/High Court judgments.
            - New, complex circulars/notifications.
            - Significant legal amendments.
            - Important official clarifications (FAQs).
         6. **STRICTLY EXCLUDE:**
            - Unverified or older topics (regardless of significance).
            - Simple news (due dates, reminders), seminars, general economic news.
         7. Select the single most impactful **VERIFIED and RECENT** topic.
         8. If NO such topic is found after thorough verification, output **ONLY** the text "NO_SUITABLE_VERIFIED_TOPIC_FOUND". This is mandatory if accuracy/recency cannot be guaranteed.

         **OUTPUT:**
         Create your own original, professional topic title for the selected topic, including the verified source's publication/judgment date.
         Your final output MUST be ONLY this single-line title.
         Example: "Supreme Court Clarifies GST ITC Rules for Bona Fide Purchases (Judgment dated Oct 18, 2025)"
        `;
        
        console.log('Finding a high-value topic using Gemini...');
        // --- UPDATED to use safeGenerateContent ---
        const latestTopicRaw = await safeGenerateContent(modelWithSearch, topicFinderPrompt);

        if (latestTopicRaw === null) {
            // safeGenerateContent already logged the error
            throw new Error("Gemini call failed or was blocked during topic finding.");
        }
        const latestTopic = latestTopicRaw.trim();
        // --- END OF UPDATE ---

       if (latestTopic === "NO_SUITABLE_VERIFIED_TOPIC_FOUND" || latestTopic.length < 15) { // Update this line
        console.log("Could not find a suitable VERIFIED topic..."); // Update log
        process.exit(0);
        }
        console.log(`High-Value Topic Found: "${latestTopic}"`);

        // --- Gemini se Found Topic par Original Blog Likhwao ---
        const blogWriterPrompt = `
         You are an expert Indian Chartered Accountant and Legal Analyst. Your task is to write a comprehensive, 100% original, and deeply analytical blog article on the topic: "${latestTopic}".

         **Core Directive: This MUST be original content written by you. DO NOT copy-paste from any website. Your goal is to research, analyze, synthesize, and explain the information in your own unique words to pass all plagiarism checks and rank on Google.**

         **1. Sourcing & Analysis (CRITICAL RULE):**
         * **Deep Research:** You MUST use Google Search to research this topic thoroughly.
         * **Synthesize Multiple Sources:** Your analysis must be based on synthesizing information from *multiple* different sources (e.g., official notifications, reputable legal portals). **Do not rely on just one source.**
         * **No Third-Party Citations:** You MUST NOT link to or even mention any third-party websites (like TaxGuru, Taxmann, etc.) in your article.
         * **Link Priority (CRITICAL):**
           * 1. **(BEST)** The direct official PDF/Judgment link (e.g., from egazette.nic.in, cbic.gov.in, main.sci.gov.in).
           * 2. **(GOOD)** If the direct PDF/Judgment link cannot be found, link to the *official Press Release (PIB)* or the main *'Notifications'/'Judgments' section* of the relevant ministry/court website (e.g., 'https://cbic.gov.in/notifications', 'https://main.sci.gov.in/judgments').
           * 3. **(LAST RESORT)** If no specific link is found, link to the ministry/court homepage (e.g., 'https://incometaxindia.gov.in/', 'https://mca.gov.in/').
         * **CRITICAL:** **NEVER** invent (hallucinate) a link. If you cannot find a link from Priority 1 or 2, use Priority 3.

         **2. Persona & Tone (FOR HUMAN-LIKE WRITING):**
         * **Be a Colleague, Not a Robot:** Write as a senior, experienced colleague explaining a complex topic to another professional. Be helpful and insightful, not just descriptive.
         * **Conversational & Engaging:** Use a professional *but conversational* tone. Ask rhetorical questions (e.g., "Toh ab iska matlab kya hai?", "Aap soch rahe honge ki iska impact kya hoga?").
         * **Simple Language:** Avoid overly complex jargon. Jahaan zaroori ho, complex term ko explain karein.
         * **Strategic Hinglish:** Feel free to use simple Hinglish phrases *naturally* where they fit, just like a real Indian professional would (e.g., "Yeh rule ab applicable nahi hai", "Isse clients ko kaafi relief milegi", "Yeh poora maamla kya hai?").
         * **Avoid AI Clichés:** Do not use robotic phrases like "In today's fast-paced world," "In conclusion," "It is important to note," or "This blog post will delve into...". Be direct and start naturally.
         
         **Hinglish vs. Hindi (CRITICAL):**
             * **ALLOWED (Hinglish):** You can (and should) mix simple Hindi/Urdu words into English sentences *naturally*, as long as you use the **Roman (English) alphabet**. (e.g., "Yeh rule ab *applicable* nahi hai", "Isse clients ko *kaafi* relief milegi", "Let's *samjho* this new notification").
             * **NOT ALLOWED (Pure Hindi):** You MUST NOT write full sentences in the Devanagari (Hindi) script (e.g., "क्या आप भी परेशान हैं?"). All content, and especially **all headings and sub-headings, MUST be in the Roman (English) alphabet.**

         **3. Format:**
         * Use Markdown. Structure the article with a main heading (#), logical sub-headings (##, ###), and bullet points (*).
        * Use **bold** for key terms and legal provisions.

         **4. Content & Structure (Unlimited Words):**
         * **Article Title (First Line):** The very first line MUST be an H1 tag (#) containing a new, engaging, SEO-friendly version of the topic. (e.g., \`# ${latestTopic}: A Complete Analysis\`).
         * **Introduction:** Start with a hook or a common problem professionals are facing. (e.g., "Kya aap bhi GST ke is naye rule se confuse hain? Chaliye, isko aasaan bhasha mein samajhte hain.")
         * **Detailed Analysis:** This is the main body. Explain the 'what', 'why', and 'how'. Cover all situations. Mention important dates.
         * **If it's an Amendment:** Use a Markdown table to compare the **Old Provision** vs. **New Provision**.
         * **If it's a Judgment:** Structure your analysis clearly: \`### Facts of the Case\`, \`### Legal Provisions Involved\`, \`### The Court's Decision & Rationale\`.
         * **Practical Examples:** Include 1-2 real-world examples.
         * **Conclusion (Final Thoughts):** Summarize the key takeaways. End with a concluding thought or actionable advice.
         * **Official Sources (Mandatory):** End the article with: \`## Read the Official Document\` \n \`* [Download the Official Notification/Circular here](LINK_TO_GOV_PAGE_OR_PDF)\` \n \`* [Read the Full Judgment here](LINK_TO_COURT_WEBSITE)\` (Include relevant links).

         **5. OUTPUT FORMATTING (CRITICAL):**
         * **START IMMEDIATELY:** Your response MUST start *directly* with the H1 tag (the '#' character).
         * **NO PREAMBLE:** Do NOT include *any* preamble, conversational text, thinking process, or any text like "Here's the plan..." or "I found the link..." before the H1 tag.

         **6. Exclusions:**
         * Do NOT add a 'Published on' date.
        `; // <-- Prompt ends here with backtick

        console.log('Generating original, human-like blog content...');
        // --- UPDATED to use safeGenerateContent ---
        const blogContentRaw = await safeGenerateContent(modelWithSearch, blogWriterPrompt);

        if (blogContentRaw === null) {
            // safeGenerateContent already logged the error
            throw new Error("Gemini call failed or was blocked during content writing.");
        }
        // --- END OF UPDATE ---
        
        // --- NEW: Clean the response and find the start of the article ---
        // Find the index of the *first* H1 tag (which is '# ')
        const h1Index = blogContentRaw.indexOf('# ');

        if (!blogContentRaw || h1Index === -1) {
            // The response is empty OR the H1 tag is missing completely
            console.error("Invalid blog content received (empty or no H1 tag found):", blogContentRaw);
            throw new Error("Gemini did not return valid blog content (missing '# ').");
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

        // --- File Save Karne ka Logic ---
        const title = blogContent.split('\n')[0].replace('# ', '').trim();
       const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const fileName = `${sanitizedTitle.substring(0, 50)}_${Date.now()}.md`;

        const fileMetadata = {
            name: fileName,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], // <-- !! IMPORTANT: Make sure this ENV VAR is set in GitHub Secrets
            mimeType: 'text/markdown',
            description: title
        };
        const media = { mimeType: 'text/markdown', body: blogContent };

        console.log(`Attempting to save file: ${fileName} to Drive folder ID: ${process.env.GOOGLE_DRIVE_BLOGS_FOLDER_ID}`);
        const driveResponse = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name' });

        console.log(`✅ Blog article created successfully: ${driveResponse.data.name} (ID: ${driveResponse.data.id})`);
     // Exit successfully
        process.exit(0);

    } catch (error) { // <-- Catch block starts here
        console.error('❌ Error in blog generator script:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        // Exit with error code for GitHub Actions
        process.exit(1);
    } // <-- Catch block ends here
} // <-- generateBlog function ends here

// --- Run the main function ---
generateBlog(); // <-- Final call to run the function

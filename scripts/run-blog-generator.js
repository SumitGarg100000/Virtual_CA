// scripts/run-blog-generator.js

import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Add this helper function near the top of BOTH scripts
function getCurrentDateFormatted() {
    return new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
    });
}


// --- MAIN FUNCTION ---
async function generateBlog() {
    console.log('Blog generator script started...');

    try {
        // --- Security Check (Optional in GitHub Actions, but good practice) ---
        // We assume CRON_SECRET is set correctly in the environment
        if (!process.env.CRON_SECRET || process.env.CRON_SECRET === "YOUR_SECRET_HERE") {
             console.warn('CRON_SECRET is not set or is using a placeholder.');
             // Decide if you want to exit or continue if the secret isn't vital here
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
        const topicResult = await modelWithSearch.generateContent(topicFinderPrompt);

        // Robust check for Gemini response
        if (!topicResult || !topicResult.response) {
            console.error("Gemini returned no response for topic finder.");
            console.error("Full Gemini Result (if any):", JSON.stringify(topicResult, null, 2));
            throw new Error("Gemini returned no response (it might have been blocked for safety).");
        }

        const latestTopic = (await topicResult.response.text()).trim();

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
         * **Synthesize Multiple Sources:** Your analysis must be based on synthesizing information from *multiple* different sources (e.g., official notifications, TaxGuru, Taxmann, Live Law, etc.). **Do not rely on just one source.** This is key to providing unique insights.
         * **No Third-Party Citations:** You MUST NOT link to or even mention any third-party websites (like TaxGuru, Taxmann, etc.) in your article.
         * **Official Links Only:** You MUST find the direct, official government links (e.g., the official notification PDF from cbic.gov.in, incometaxindia.gov.in, or the official Court judgment download link) and add them at the very end.

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
         * **Official Sources (Mandatory):** End the article with: \`## Read the Official Document\` \n \`* [Download the Official Notification/Circular here](LINK_TO_GOV_PDF)\` \n \`* [Read the Full Judgment here](LINK_TO_COURT_WEBSITE)\` (Include relevant links).

         **5. Exclusions:**
         * Do NOT add a 'Published on' date.
        `; // <-- Prompt ends here with backtick

        console.log('Generating original, human-like blog content...');
        const blogResult = await modelWithSearch.generateContent(blogWriterPrompt);

        // Robust check for Gemini response
        if (!blogResult || !blogResult.response) {
            console.error("Gemini returned no response for writing the blog.");
            console.error("Full Gemini Result (if any):", JSON.stringify(blogResult, null, 2));
            throw new Error("Gemini returned no response (it might have been blocked for safety).");
        }
        let blogContent = await blogResult.response.text();

        if (!blogContent || !blogContent.startsWith('# ')) {
            console.error("Invalid blog content received:", blogContent);
            throw new Error("Gemini did not return valid blog content starting with '# '.");
        }

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
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
            mimeType: 'text/markdown',
            description: title
        };
        const media = { mimeType: 'text/markdown', body: blogContent };

        console.log(`Attempting to save file: ${fileName} to Drive folder ID: ${process.env.GOOGLE_DRIVE_FOLDER_ID}`);
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

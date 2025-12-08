import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION: Folders ---
const BLOGS_DIR = path.join(process.cwd(), 'data', 'blogs');
const LIST_FILE = path.join(process.cwd(), 'data', 'blog-list.json');

// --- Helper: Date Formatter ---
function getCurrentDateFormatted() {
    return new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
    });
}

// --- Helper: Delay for Retries ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Helper: Safe Gemini Call (With Retry Logic) ---
async function safeGenerateContent(model, prompt) {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            const isOverloaded = error.message.includes('503') || error.status === 503;
            const isRateLimit = error.message.includes('429') || error.status === 429;

            if ((isOverloaded || isRateLimit) && attempt < maxRetries) {
                const waitTime = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s...
                console.warn(`⚠️ API Busy (Attempt ${attempt}). Retrying in ${waitTime / 1000}s...`);
                await delay(waitTime);
                continue;
            }
            
            // If it's a fatal error, log it and return null
            console.error("❌ Gemini Fatal Error:", error.message);
            return null;
        }
    }
    return null;
}

// --- MAIN FUNCTION ---
async function generateBlog() {
    console.log('🚀 Blog Generator started (Local Mode)...');

    try {
        // 1. Initialize Gemini (Using STABLE 1.5 Flash)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [{ "google_search": {} }] });

        // 2. Find Topic
        const currentDate = getCurrentDateFormatted();
        console.log('🔍 Finding trending topic...');
        
        const topicPrompt = `
          **Current Date:** ${currentDate}.
          Find a critical legal/tax update for Indian CAs from the last 7 days.
          Verify it exists. Output ONLY the title. 
          If nothing found, output: NO_TOPIC
        `;
        
        const topicRaw = await safeGenerateContent(model, topicPrompt);
        const topic = topicRaw ? topicRaw.trim() : "NO_TOPIC";

        if (topic.includes("NO_TOPIC") || topic.length < 10) {
            console.log("⚠️ No new topic found. Exiting.");
            process.exit(0);
        }
        console.log(`✅ Topic Found: "${topic}"`);

        // 3. Generate Content
        console.log('✍️ Writing article...');
        const contentPrompt = `
          Write a detailed blog post on: "${topic}".
          **IMPORTANT:** Start directly with a # Heading (H1). 
          Use Markdown format.
          Do NOT add any intro text like "Here is the blog".
        `;

        const content = await safeGenerateContent(model, contentPrompt);
        if (!content) throw new Error("Failed to generate content after retries");

        // 4. Create File Metadata
        const titleLine = content.split('\n')[0].replace('#', '').trim();
        const finalTitle = titleLine || topic;
        
        const slug = finalTitle.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''); 
        
        const fileName = `${slug}.json`;
        const filePath = path.join(BLOGS_DIR, fileName);

        // 5. Data Object
        const blogPost = {
            id: slug,
            title: finalTitle,
            date: getCurrentDateFormatted(),
            content: content,
            created_at: new Date().toISOString()
        };

        // 6. Save JSON File
        fs.writeFileSync(filePath, JSON.stringify(blogPost, null, 2));
        console.log(`💾 Saved Blog File: ${fileName}`);

        // 7. Update Master List
        let listData = [];
        if (fs.existsSync(LIST_FILE)) {
            const raw = fs.readFileSync(LIST_FILE, 'utf8');
            listData = JSON.parse(raw);
        }

        const listItem = {
            id: slug,
            title: finalTitle,
            date: blogPost.date,
            url: `/data/blogs/${fileName}`
        };

        listData.unshift(listItem);
        fs.writeFileSync(LIST_FILE, JSON.stringify(listData, null, 2));
        console.log(`📝 Updated Master List.`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

generateBlog();

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const UPDATES_DIR = path.join(process.cwd(), 'data', 'updates');
const LIST_FILE = path.join(process.cwd(), 'data', 'update-list.json');

// Helper: Date
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
            
            console.error("❌ Gemini Fatal Error:", error.message);
            return null;
        }
    }
    return null;
}

// --- MAIN FUNCTION ---
async function generateUpdate() {
    console.log('🚀 Update Generator started (Local Mode)...');

    try {
        // 1. Initialize Gemini (Using STABLE 1.5 Flash)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [{ "google_search": {} }] });

        // 2. Find Update Topic
        const currentDate = getCurrentDateFormatted();
        console.log('🔍 Finding latest update...');
        
        const topicPrompt = `
        Current Date: ${currentDate}.
        Find a very recent official notification/news for CAs (last 24-48 hours).
        Output ONLY the title. If none, output: NO_UPDATE
        `;

        const topicRaw = await safeGenerateContent(model, topicPrompt);
        const topic = topicRaw ? topicRaw.trim() : "NO_UPDATE";

        if (topic.includes("NO_UPDATE") || topic.length < 10) {
            console.log("⚠️ No new updates found.");
            process.exit(0);
        }
        console.log(`✅ Update Topic: "${topic}"`);

        // 3. Generate Short Content
        const contentPrompt = `
        Write a short, factual update on: "${topic}".
        Start with # Heading.
        Keep it under 150 words. Use Markdown bullets.
        `;
        const content = await safeGenerateContent(model, contentPrompt);
        if (!content) throw new Error("Failed to generate content after retries");

        // 4. Prepare Data
        const titleLine = content.split('\n')[0].replace('#', '').trim();
        const finalTitle = titleLine || topic;
        
        const id = `update_${Date.now()}`; 
        const fileName = `${id}.json`;
        const filePath = path.join(UPDATES_DIR, fileName);

        const updatePost = {
            id: id,
            title: finalTitle,
            date: getCurrentDateFormatted(),
            content: content,
            created_at: new Date().toISOString()
        };

        // 5. Check Duplicate
        let listData = [];
        if (fs.existsSync(LIST_FILE)) {
            listData = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));
        }

        if (listData.some(item => item.title === finalTitle)) {
            console.log("⚠️ Duplicate Update found. Skipping.");
            process.exit(0);
        }

        // 6. Save File
        fs.writeFileSync(filePath, JSON.stringify(updatePost, null, 2));
        console.log(`💾 Saved Update File: ${fileName}`);

        // 7. Update List
        const listItem = {
            id: id,
            title: finalTitle,
            date: updatePost.date,
            url: `/data/updates/${fileName}`
        };

        listData.unshift(listItem);
        fs.writeFileSync(LIST_FILE, JSON.stringify(listData, null, 2));
        console.log(`📝 Updated Update List.`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

generateUpdate();

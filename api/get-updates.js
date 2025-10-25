// File: /api/get-updates.js

// Google Generative AI SDK ko import karein
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Vercel Environment Variable se API key lein
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;

// AI ko initialize karein
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  // Google Search tool ka istemal karein
  tools: {
    googleSearch: {},
  },
});

// Safety settings set karein
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// API ka main function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests allowed' });
  }

  try {
    // 1. Frontend se topic lein
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required.' });
    }

    // 2. AI ke liye system instruction (Prompt)
    const systemInstruction = `
      You are a 'Latest Updates' assistant. Your job is to find the most recent news for the user's topic.
      1.  **Topic to search:** "${topic}"
      2.  **Timeframe:** Search for news and updates ONLY from the "past 24 hours".
      3.  **Task:** Perform a Google Search based on the topic and timeframe.
      4.  **Format:** Read the search results and generate a JSON array of 5 to 7 short, one-line headings summarizing each unique update.
      5.  **Output:** Only output the JSON array. Do not add any conversational text like 'Here are the updates:'.
      6.  **If no news:** If no relevant news is found in the past 24 hours, return an empty array [].

      Example Output:
      [
        "Update heading 1...",
        "Update heading 2...",
        "Update heading 3..."
      ]
    `;

    // 3. AI ko call karein
    const chat = model.startChat({
      history: [{ role: 'user', parts: [{ text: systemInstruction }] }],
      safetySettings: safetySettings,
    });

    // Humara prompt
    const userMessage = "Give me the latest updates based on the instructions.";
    
    // AI ko Google Search karne ke liye force karein
    const result = await chat.sendMessage(userMessage, {
      toolCall: {
        functionCalls: [{
          name: 'googleSearch',
          args: { query: `${topic} latest news past 24 hours` }
        }]
      }
    });

    // 4. AI ka response process karein
    const response = result.response;
    let responseText = response.candidates[0].content.parts[0].text;
    
    // AI se text ko saaf karein (agar JSON block mein hai)
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    // 5. JSON ko parse karke frontend ko bhejein
    try {
      const updates = JSON.parse(responseText);
      return res.status(200).json({ updates });
    } catch (parseError) {
      // Agar AI ne JSON nahi bheja
      console.error("Failed to parse AI response:", responseText);
      return res.status(200).json({ updates: ["Failed to parse updates from AI."] });
    }

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch updates.' });
  }
}

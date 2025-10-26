// File: /api/get-updates.js (UPDATED with Multi-Key Support)

// Google Generative AI SDK ko import karein
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Safety settings set karein (yeh global reh sakta hai)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ---------------------------------------------------------------
// genAI aur model ki initialization ko yahan se hata diya gaya hai
// ---------------------------------------------------------------

// API ka main function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests allowed' });
  }

  try {
    // 1. Frontend se topic aur keyIndex lein
    const { topic, keyIndex = 0 } = req.body; // <-- keyIndex YAHAN ADD KIYA GAYA HAI
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required.' });
    }

    // 2. Multiple API Key wala logic (chat.js se copy kiya gaya)
    const apiKeysString = process.env.GOOGLE_API_KEY;
    if (!apiKeysString) {
      throw new Error("API key is not configured on the server.");
    }
    const allApiKeys = apiKeysString.split(',').map(key => key.trim());

    if (keyIndex >= allApiKeys.length) {
      return res.status(400).json({ error: 'INVALID_KEY_INDEX' });
    }
    
    // Sahi API key chunein
    const apiKey = allApiKeys[keyIndex];

    // 3. AI ko ab handler ke andar initialize karein
    const genAI = new GoogleGenerativeAI(apiKey); // <-- 'apiKey' ka istemal karein
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: {
        googleSearch: {},
      },
    });

    // 4. AI ke liye system instruction (Prompt) - (Yeh same rahega)
    const systemInstruction = `
      You are a 'Latest Updates' assistant. Your job is to find the most recent news for the user's topic.
      1.  **Topic to search:** "${topic}"
      2.  **Timeframe:** Search for news and updates ONLY from the "past 24 hours".
      3.  **Task:** Perform a Google Search based on the topic and timeframe.
      4.  **Format:** Read the search results and generate a JSON array of 5 to 7 short, one-line headings summarizing each unique update.
      5.  **Output:** Only output the JSON array. Do not add any conversational text like 'Here are the updates:'.
      6.  **If no news:** If no relevant news is found in the past 24 hours, return an empty array [].
    
      Example Output:
      [
        "Update heading 1...",
        "Update heading 2...",
        "Update heading 3..."
      ]
    `;

    // 5. AI ko call karein (Yeh same rahega)
    const chat = model.startChat({
      history: [{ role: 'user', parts: [{ text: systemInstruction }] }],
      safetySettings: safetySettings,
    });

    const userMessage = "Give me the latest updates based on the instructions.";
    
    const result = await chat.sendMessage(userMessage, {
      toolCall: {
        functionCalls: [{
          name: 'googleSearch',
          args: { query: `${topic} latest news past 24 hours` }
        }]
      }
    });

    // 6. AI ka response process karein (Yeh same rahega)
    const response = result.response;
    let responseText = response.candidates[0].content.parts[0].text;
    
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    // 7. JSON ko parse karke frontend ko bhejein (Yeh same rahega)
    try {
      const updates = JSON.parse(responseText);
      return res.status(200).json({ updates });
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return res.status(200).json({ updates: ["Failed to parse updates from AI."] });
    }

  } catch (error) {
    // 8. Error handling ko bhi update karein (Quota error ke liye)
    console.error('Gemini API Error:', error);

    // Quota error check (chat.js se copy kiya gaya)
    if (error.message && (error.message.includes('429') || (error.status && error.status === 429))) {
      console.warn(`Quota exceeded for key at index ${req.body.keyIndex}`);
      return res.status(429).json({ 
        error: 'QUOTA_EXCEEDED', 
        failedKeyIndex: req.body.keyIndex
      });
    }
    
    return res.status(500).json({ error: 'Failed to fetch updates.' });
  }
}

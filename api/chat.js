// api/chat.js
// Yeh ek proxy serverless function hai.
// Frontend isse contact karega, aur yeh function securely
// Google Generative AI API se contact karega.
// Is tarah aapki API Key hamesha chhipi rahegi.

// NOTE: Aapko Vercel par 'npm install @google/generative-ai' ya package.json mein add karna hoga.
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { history, message, systemInstruction, keyIndex = 0 } = req.body;

// 1. Environment variable ko 'apiKeysString' mein store karein
const apiKeysString = process.env.GOOGLE_API_KEY;
if (!apiKeysString) {
  throw new Error("API key is not configured on the server.");
}

// 2. 'apiKeysString' se array banayein
const allApiKeys = apiKeysString.split(',').map(key => key.trim());

if (keyIndex >= allApiKeys.length) {
  return res.status(400).json({ error: 'INVALID_KEY_INDEX' });
}

// 3. 'apiKey' ko yahan sirf ek baar declare karein
const apiKey = allApiKeys[keyIndex];

    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction,
      tools: [{ google_search: {} }]
    });

    const chat = model.startChat({ history: history });
    const result = await chat.sendMessageStream(message);

    // Response ko stream ke roop mein frontend par vaapas bhejein
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }

    res.end();

  } catch (error) {
    console.error("Error in API proxy:", error);
    if (error.message && error.message.includes('429')) {
      console.warn(`Quota exceeded for key at index ${req.body.keyIndex}`);
      return res.status(429).json({ 
        error: 'QUOTA_EXCEEDED', 
        failedKeyIndex: req.body.keyIndex
      });
    }
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

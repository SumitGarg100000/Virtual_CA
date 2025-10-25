// api/validate-code.js

export default function handler(req, res) {
  // Sirf POST requests ko allow karein
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // --- APNE SABHI CODES AUR REFERENCE CODES YAHAAN ADD KAREIN ---
  // Har secret code ka apna ek reference code hona chahiye
  const secretCodes = {
    "PREMIUM2024":  { "expiryDate": "2024-12-31", "referenceCode": "REF_PREMIUM" },
    "LIFETIME2024": { "expiryDate": "2030-12-31", "referenceCode": "LIFE2024" },
    "NEWCODE567":   { "expiryDate": "2025-05-20", "referenceCode": "REF_NEW567" }
    // Example: "CODE123": { "expiryDate": "2026-01-01", "referenceCode": "XYZ987" },
  };
  // --- YAHAN TAK EDIT KAREIN ---

  // Frontend se 'code' aur 'refCode' nikalein
  const { code, refCode } = req.body; // <-- BADLAV 1: refCode add kiya

  if (!code || !refCode) { // <-- BADLAV 2: Dono ko check kiya
    return res.status(400).json({ valid: false, message: 'Secret code and Reference code are required.' });
  }

  // Upar diye gaye object se code ko check karein
  const codeData = secretCodes[code];

  if (!codeData) {
    return res.status(200).json({ valid: false, message: "Please enter valid secret code" });
  }

  // Expiry check karein (Pehle jaisa hi)
  const currentDate = new Date();
  const expiryDate = new Date(codeData.expiryDate);

  if (currentDate > expiryDate) {
    return res.status(200).json({
      valid: false,
      message: `Please renew your subscription. Your subscription expired on ${codeData.expiryDate}`,
      expired: true
    });
  }

  // --- NAYA BADLAV 3: REFERENCE CODE CHECK ---
  // Check karein ki user ka refCode, secret code ke refCode se match karta hai ya nahi
  if (codeData.referenceCode !== refCode) {
    return res.status(200).json({ valid: false, message: "Invalid Reference Code" });
  }
  // --- BADLAV KHATAM ---

  // Agar sab sahi hai, to success response bhejein
  return res.status(200).json({ valid: true, message: 'Successfully authenticated!' });
}

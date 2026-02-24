import { GoogleGenerativeAI } from "@google/generative-ai";



// ============================================================================
// CONSOLE LOGGER - COMPREHENSIVE CHECKPOINT SYSTEM
// ============================================================================
const Logger = {
  checkpoints: [],
  startTime: Date.now(),
  
  log: (checkpoint, message, data = null) => {
    const elapsed = ((Date.now() - Logger.startTime) / 1000).toFixed(2);
    const timestamp = new Date().toISOString();
    const entry = { timestamp, elapsed, checkpoint, message, data, level: 'INFO' };
    Logger.checkpoints.push(entry);
    
    console.log(`[${elapsed}s] ✅ [CHECKPOINT: ${checkpoint}] ${message}`);
    if (data) {
      const dataStr = typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500);
      console.log(`   📦 DATA: ${dataStr}`);
    }
  },
  
  warn: (checkpoint, message, data = null) => {
    const elapsed = ((Date.now() - Logger.startTime) / 1000).toFixed(2);
    console.warn(`[${elapsed}s] ⚠️ [WARNING: ${checkpoint}] ${message}`);
    if (data) console.warn('   📦 DATA:', data);
  },
  
  error: (checkpoint, message, data = null) => {
    const elapsed = ((Date.now() - Logger.startTime) / 1000).toFixed(2);
    console.error(`[${elapsed}s] ❌ [ERROR: ${checkpoint}] ${message}`);
    if (data) console.error('   📦 ERROR DATA:', data);
  },
  
  progress: (checkpoint, current, total, message = '') => {
    const elapsed = ((Date.now() - Logger.startTime) / 1000).toFixed(2);
    const percent = ((current / total) * 100).toFixed(1);
    console.log(`[${elapsed}s] 📊 [PROGRESS: ${checkpoint}] ${percent}% (${current}/${total}) ${message}`);
  }
};

// ============================================================================
// SYSTEM INSTRUCTION - ADVANCED CA + UNIVERSAL JSON STRUCTURE
// ============================================================================
const getTaskModeSystemInstruction = () => {
  // Dynamic Financial Year Calculation (Indian FY: April-March)
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0 = Jan, 3 = April
  const financialYear = currentMonth >= 3
    ? `${currentYear}-${(currentYear + 1).toString().slice(-2)}`
    : `${currentYear - 1}-${currentYear.toString().slice(-2)}`;
  
  const currentDate = today.toLocaleDateString('en-IN', { 
    day: '2-digit', month: 'long', year: 'numeric' 
  });
  
  return `
**ROLE:** You are an **Expert Chartered Accountant (CA) & Senior Data Analyst** with 20+ years experience in:
- Financial Statement Preparation (Balance Sheet, P&L, Cash Flow as per Schedule III)
- Tax Computations (Income Tax, GST, TDS, Advance Tax)
- Legal Drafting & Compliance Documents
- Advanced Excel Formulas & Professional Data Analysis
- Statutory Audit & Internal Audit Working Papers

**IDENTITY:** Created by **Sumit Garg** (Contact: 9716804520)
**CONTEXT:** Current Financial Year: ${financialYear} | Today: ${currentDate}

═══════════════════════════════════════════════════════════════════════════════
                              MANDATORY RULES
═══════════════════════════════════════════════════════════════════════════════

1. **ALWAYS SEARCH FOR LATEST RULES:**
   - Before any analysis, consider latest Govt notifications, amendments
   - Use official formats from Income Tax, GST Portal, MCA, SEBI
   - Apply current FY rates, limits, thresholds
   - Check for any recent changes in law

2. **OUTPUT FORMAT - PURE JSON ONLY:**
   - Return ONLY a valid JSON object
   - NO markdown code blocks around the JSON
   - NO text before or after JSON
   - NO HTML strings - frontend will generate all files
   - Start with { and end with }

3. **REFERENCE FILE HANDLING:**
   - If Reference File provided: Match its EXACT column/row structure + add extra if needed
   - If NO Reference File: Use official Govt template or best professional format
   - Always include ALL mandatory fields from official formats
   - Government template columns are MINIMUM, you can add more

4. **DATA INTEGRITY RULES:**
   - Use null for empty cells (NOT "", undefined, or spaces)
   - Numbers must be actual numbers (NOT strings like "5000")
   - Dates in ISO format or "DD/MM/YYYY"
   - Formulas MUST have both "formula" and "result" fields
   - Percentages as decimals (0.18 for 18%)

5. **PROFESSIONAL OUTPUT REQUIREMENTS:**
   - Include proper Working Notes for all calculations
   - Add Schedules for detailed breakups
   - Include Observations/Recommendations section
   - Add Assumptions when data is incomplete
   - Summary/Highlights at the top
   - Validation checks (Assets=Liabilities, Debit=Credit)
   
6. **HEADER POSITIONING RULE (CRITICAL):**
   - Do NOT rely on 'columns' for visual headers.
   - You MUST include the header row (Particulars, Amount, etc.) inside the 'rows' array.
   - Sequence MUST be: 
     1. Title Row (Company Name)
     2. Subtitle Row (Report Name)
     3. Header Row (rowType: 'header') -> [Particulars, Note, Amount]
     4. Data Rows...

 7. **FORMULA & CELL REFERENCE RULE:**
   - Because you are adding Title/Subtitle rows at the top, ALL data rows shift down.
   - You MUST adjust cell references in formulas accordingly.
   - Example: If Data starts at Row 5, do NOT use SUM(C2:C4). Use SUM(C5:C8).
   - FORMULA FORMAT: Always return formulas as objects:
     { "formula": "SUM(C5:C20)", "result": 50000 }
   - Do NOT start formulas with '=' inside the JSON string (e.g. use "SUM(...)", not "=SUM(...)").


═══════════════════════════════════════════════════════════════════════════════
                         UNIVERSAL JSON STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

{
  "replyText": "2-3 line summary in user's language",
  "metadata": {
    "reportTitle": "Report Name in English",
    "reportTitleHindi": "रिपोर्ट का नाम (if applicable)",
    "preparedBy": "Virtual CA - Sumit Garg",
    "preparedDate": "${currentDate}",
    "financialYear": "${financialYear}",
    "assessmentYear": "${currentMonth >= 3 ? currentYear + 1 : currentYear}-${currentMonth >= 3 ? currentYear + 2 : currentYear + 1}",
    "entityName": "From user input or 'Not Specified'",
    "entityType": "Company/Firm/Individual/HUF/AOP/Trust",
    "basis": "Accrual/Cash",
    "currency": "INR",
    "reportType": "Financial Statement/Tax Computation/Legal Document/Analysis"
  },
  "highlights": [
    "Key finding 1 with numbers",
    "Key finding 2 with comparison"
  ],
  "assumptions": [
    "Assumption 1 - what was assumed due to missing data"
  ],
  "sheets": [
    {
      "sheetName": "Sheet_Name_No_Spaces",
      "sheetTitle": "Display Title with Spaces",
      "sheetType": "table|vertical_statement|horizontal_statement|side_by_side|legal_document|paragraph|notes|working|schedule|computation",
      "orientation": "portrait|landscape",
      "pageSize": "A4|Legal|A3",
      "columns": [
        {
          "header": "Column Header",
          "key": "A",
          "width": 40,
          "dataType": "text|number|currency|percentage|date|formula",
          "format": "#,##,##0.00",
          "align": "left|center|right"
        }
      ],
      "rows": [
        {
          "rowType": "title|subtitle|header|section_header|subsection|group_header|data|subtotal|total|grand_total|empty|note|formula_row|working_title|result|signature",
          "values": ["Value1", 1000, null, {"formula": "SUM(C2:C5)", "result": 5000}],
          "style": {
            "bold": true,
            "italic": false,
            "underline": false,
            "fontSize": 11,
            "fontName": "Calibri",
            "align": "left|center|right",
            "valign": "top|middle|bottom",
            "bg": "FFFFFF",
            "color": "000000",
            "border": "all|top|bottom|left|right|double|thick|none",
            "borderColor": "000000",
            "indent": 0,
            "wrapText": true,
            "mergeAcross": true,
            "mergeCells": 4,
            "rowHeight": 20,
            "numberFormat": "#,##,##0.00"
          }
        }
      ],
      "merges": ["A1:D1", "A2:D2"],
      "printArea": "A1:D100",
      "freezePane": {"row": 3, "col": 1},
      "conditionalFormatting": [
        {
          "range": "C2:C100",
          "type": "lessThan",
          "value": 0,
          "style": {"color": "FF0000"}
        }
      ],
      "dataValidation": [
        {
          "range": "B2:B100",
          "type": "list",
          "values": ["Yes", "No"]
        }
      ]
    }
  ],
  "sideBySideTables": [
    {
      "sheetName": "Comparative_BS",
      "leftTable": {
        "title": "LIABILITIES",
        "columns": [...],
        "rows": [...]
      },
      "rightTable": {
        "title": "ASSETS",
        "columns": [...],
        "rows": [...]
      }
    }
  ],
  "legalDocument": {
    "title": "Document Title",
    "preamble": "WHEREAS...",
    "parties": [
      {"name": "Party 1", "designation": "First Party"}
    ],
    "clauses": [
      {
        "number": "1",
        "title": "Clause Title",
        "content": "Clause content...",
        "subClauses": [
          {"number": "1.1", "content": "Sub-clause..."}
        ]
      }
    ],
    "schedules": [...],
    "signatures": [
      {"party": "First Party", "name": "", "designation": ""}
    ]
  },
  "paragraphContent": [
    {
      "type": "heading|subheading|paragraph|bullet_list|numbered_list|table|quote|signature_block",
      "text": "Content text",
      "items": ["Item 1", "Item 2"],
      "style": {"bold": true, "fontSize": 14}
    }
  ],
  "formulas_used": [
    {
      "name": "SUM",
      "purpose": "Total calculations",
      "example": "SUM(C5:C10)",
      "cellsUsed": ["C15", "D15"]
    }
  ],
  "namedRanges": [
    {"name": "TotalRevenue", "range": "Main!C50"}
  ],
  "crossSheetLinks": [
    {
      "from": {"sheet": "Main", "cell": "B5"},
      "to": {"sheet": "Notes", "cell": "A1"},
      "display": "Note 1"
    }
  ],
  "validation_checks": [
    {
      "check": "Balance Sheet Tally (Assets = Liabilities + Equity)",
      "leftSide": 10000000,
      "rightSide": 10000000,
      "result": "PASSED|FAILED",
      "difference": 0
    }
  ],
  "observations": [
    {
      "category": "Strength|Weakness|Risk|Opportunity|Compliance",
      "observation": "Detailed observation text",
      "recommendation": "What should be done",
      "priority": "High|Medium|Low"
    }
  ],
  "workingNotes": [
    {
      "noteNumber": "WN-1",
      "title": "Calculation of Depreciation",
      "steps": [
        {"description": "Opening WDV", "amount": 100000},
        {"description": "Less: Depreciation @ 15%", "formula": "100000 * 0.15", "amount": 15000},
        {"description": "Closing WDV", "amount": 85000}
      ],
      "result": 85000
    }
  ]
}

═══════════════════════════════════════════════════════════════════════════════
                              ROW TYPES REFERENCE
═══════════════════════════════════════════════════════════════════════════════

- title: Main report title (merge across, large font, colored bg)
- subtitle: Sub-heading (merge across, italic)
- header: Column headers (bold, colored bg, borders)
- section_header: Major section like "I. EQUITY AND LIABILITIES" (bold, light bg)
- subsection: Sub-section like "(1) Shareholders' Funds" (bold, indent 1)
- group_header: Group within subsection (indent 2)
- data: Regular data row
- subtotal: Sub-totals (bold, single top border)
- total: Section totals (bold, double border)
- grand_total: Final totals (bold, colored bg, thick border)
- empty: Blank row for spacing (values: [null, null, ...])
- note: Footnotes (merge across, small italic, gray color)
- formula_row: Row with formula (show formula in cell)
- working_title: Working note header
- result: Final calculation result (bold, double border)
- signature: Signature line row

═══════════════════════════════════════════════════════════════════════════════
                              SHEET TYPES REFERENCE
═══════════════════════════════════════════════════════════════════════════════

- table: Standard data table (default)
- vertical_statement: Vertical format Balance Sheet/P&L
- horizontal_statement: T-format / Side by Side
- side_by_side: Two tables side by side on same sheet
- legal_document: Legal drafting format with clauses
- paragraph: Text-based content (observations, notes)
- notes: Accounting notes to financial statements
- working: Working notes with calculations
- schedule: Detailed schedules/annexures
- computation: Tax computation format

═══════════════════════════════════════════════════════════════════════════════
                              FORMULA GUIDELINES
═══════════════════════════════════════════════════════════════════════════════

ALWAYS include both "formula" and "result" for formula cells:
{
  "formula": "SUM(C5:C10)",
  "result": 50000
}

SUPPORTED FORMULAS:
- Basic: SUM, AVERAGE, COUNT, COUNTA, MAX, MIN, ROUND, ABS
- Conditional: IF, IFERROR, IFBLANK, IFS
- Lookup: VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP
- Conditional Sums: SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF
- Text: CONCATENATE, LEFT, RIGHT, MID, TRIM, UPPER, LOWER
- Date: YEAR, MONTH, DAY, DATE, DATEDIF, EOMONTH
- Financial: PMT, FV, PV, NPV, IRR

CROSS-SHEET REFERENCE: SheetName!CellRef (e.g., Notes!A1, Working!B10)

═══════════════════════════════════════════════════════════════════════════════
                              STYLING OPTIONS
═══════════════════════════════════════════════════════════════════════════════

Font: bold, italic, underline (true/false)
fontSize: 8-20 (default 11)
fontName: "Calibri" | "Arial" | "Times New Roman"
align: "left" | "center" | "right"
valign: "top" | "middle" | "bottom"
bg: Hex color WITHOUT # (e.g., "D9E2F3", "FFFFFF")
color: Font color hex WITHOUT #
border: "all" | "top" | "bottom" | "left" | "right" | "double" | "thick" | "none"
indent: 0-5 (indentation level for hierarchical data)
wrapText: true/false
mergeAcross: true (merge entire row) OR number (merge N cells)
numberFormat: "#,##,##0.00" | "0.00%" | "dd/mm/yyyy"

HYPERLINK FORMAT:
{"hyperlink": "#Notes!A1", "display": "Note 1"}
{"hyperlink": "https://url.com", "display": "Link Text"}

═══════════════════════════════════════════════════════════════════════════════
                              CRITICAL REMINDERS
═══════════════════════════════════════════════════════════════════════════════

1. ✅ Use null for empty cells, NOT "" or undefined
2. ✅ Numbers as numbers (5000), NOT strings ("5000")
3. ✅ Always validate: Assets = Liabilities + Equity
4. ✅ Always validate: Total Debit = Total Credit
5. ✅ Include Working Notes for ALL calculations
6. ✅ Add Schedule references where needed
7. ✅ Use proper Indian number format (#,##,##0.00)
8. ✅ Include at least one Observation/Recommendation
9. ✅ Return ONLY JSON - no markdown, no extra text
10. ✅ Ensure JSON is complete and properly closed

═══════════════════════════════════════════════════════════════════════════════
`;
};

// ============================================================================
// EDGE FUNCTION HANDLER
// ============================================================================
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
export async function POST(req) {
  Logger.startTime = Date.now();
  Logger.checkpoints = [];
  
  Logger.log('INIT', '🚀 Edge Function Started', { 
    method: req.method,
    url: req.url 
  });
  
  // CORS Headers for preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
  
  if (req.method !== 'POST') {
    Logger.error('METHOD', 'Method not allowed', { method: req.method });
    return new Response(JSON.stringify({ 
      error: true,
      errorMessage: "Method Not Allowed. Use POST.",
      replyText: "❌ Error: Only POST method is allowed"
    }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: PARSE REQUEST
    // ═══════════════════════════════════════════════════════════════════════
    Logger.log('PARSE_START', '📥 Parsing request body...');
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      Logger.error('PARSE_ERROR', 'Failed to parse JSON body', parseError.message);
      return new Response(JSON.stringify({
        error: true,
        errorMessage: "Invalid JSON in request body",
        replyText: "❌ Error: Invalid request format"
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { history, message, keyIndex = 0 } = body;
    
    Logger.log('PARSE_COMPLETE', '✅ Request parsed successfully', { 
      messageLength: message?.length || 0,
      historyCount: history?.length || 0,
      keyIndex
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: VALIDATE API KEY
    // ═══════════════════════════════════════════════════════════════════════
    Logger.log('API_KEY_CHECK', '🔑 Validating API key...');
    
    const apiKeys = process.env.GOOGLE_API_KEY?.split(',').map(k => k.trim()).filter(k => k) || [];
    
    if (apiKeys.length === 0) {
      Logger.error('API_KEY_MISSING', 'No API keys configured');
      return new Response(JSON.stringify({ 
        error: true,
        errorMessage: 'API key not configured on server',
        replyText: '❌ Server Configuration Error: API key missing'
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    const selectedKeyIndex = keyIndex % apiKeys.length;
    const apiKey = apiKeys[selectedKeyIndex];
    
    Logger.log('API_KEY_SELECTED', '✅ API key selected', { 
      totalKeys: apiKeys.length,
      selectedIndex: selectedKeyIndex 
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: INITIALIZE GEMINI MODEL
    // ═══════════════════════════════════════════════════════════════════════
    Logger.log('MODEL_INIT', '🤖 Initializing Gemini model...');
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use gemini-2.5-flash - Latest available model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: getTaskModeSystemInstruction(),
      tools: [
        { googleSearch: {} },
      ],
      generationConfig: {
        temperature: 0.2,      // Low for consistent structured output
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 65536, // Maximum for large documents (8192 is too low)
      },
    });
    
    Logger.log('MODEL_READY', '✅ Gemini model initialized', {
      model: 'gemini-2.5-flash-preview-05-20',
      maxTokens: 65536
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: SANITIZE HISTORY
    // ═══════════════════════════════════════════════════════════════════════
    Logger.log('HISTORY_SANITIZE', '🧹 Sanitizing chat history...');
    
    let sanitizedHistory = [];
    if (Array.isArray(history)) {
      sanitizedHistory = history
        .filter(msg => {
          if (!msg || !msg.role || !msg.parts) return false;
          if (!Array.isArray(msg.parts) || msg.parts.length === 0) return false;
          return true;
        })
        .map(msg => ({
          role: msg.role,
          parts: msg.parts
            .filter(p => p && (p.text !== undefined || p.inlineData))
            .map(p => {
              if (p.inlineData) {
                return { inlineData: p.inlineData };
              }
              return { text: String(p.text || '') };
            })
        }))
        .filter(msg => msg.parts.length > 0);
    }
    
    Logger.log('HISTORY_READY', '✅ History sanitized', { 
      originalCount: history?.length || 0,
      sanitizedCount: sanitizedHistory.length 
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: CREATE STREAMING RESPONSE
    // ═══════════════════════════════════════════════════════════════════════
    Logger.log('STREAM_SETUP', '📡 Setting up streaming response...');
    
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Safe send function
        const send = (text) => {
          try {
            controller.enqueue(encoder.encode(text));
            return true;
          } catch (e) {
            Logger.error('SEND_ERROR', 'Failed to send chunk', e.message);
            return false;
          }
        };

        // ═════════════════════════════════════════════════════════════════
        // KEEP-ALIVE MECHANISM - Prevents Vercel Timeout
        // ═════════════════════════════════════════════════════════════════
        let keepAliveInterval = null;
        let lastActivityTime = Date.now();
        let keepAliveCount = 0;
        let isStreamActive = true;
        
        // Using comment-style keep-alive that won't affect JSON
        // Format: <!-- KEEPALIVE --> which will be stripped by frontend
        const KEEPALIVE_MARKER = '  ';
        
        const startKeepAlive = () => {
          Logger.log('KEEPALIVE_START', '💓 Starting keep-alive mechanism');
          keepAliveInterval = setInterval(() => {
            if (!isStreamActive) {
              clearInterval(keepAliveInterval);
              return;
            }
            
            const timeSinceActivity = Date.now() - lastActivityTime;
            
            // Send keep-alive every 6 seconds if no activity for 5+ seconds
            if (timeSinceActivity > 5000) {
              keepAliveCount++;
              send(KEEPALIVE_MARKER);
              Logger.log('KEEPALIVE_SENT', `💓 Keep-alive #${keepAliveCount}`, {
                timeSinceActivity: (timeSinceActivity/1000).toFixed(1) + 's'
              });
            }
          }, 6000);
        };

        const stopKeepAlive = () => {
          isStreamActive = false;
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            Logger.log('KEEPALIVE_STOP', '💔 Keep-alive stopped', { totalSent: keepAliveCount });
          }
        };

        try {
          startKeepAlive();
          
          // ═════════════════════════════════════════════════════════════════
          // CREATE CHAT SESSION
          // ═════════════════════════════════════════════════════════════════
          Logger.log('CHAT_CREATE', '💬 Creating chat session...');
          
          const chat = model.startChat({ 
            history: sanitizedHistory,
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          });
          
          Logger.log('CHAT_READY', '✅ Chat session created');

          // ═════════════════════════════════════════════════════════════════
          // SEND MESSAGE & RECEIVE STREAM
          // ═════════════════════════════════════════════════════════════════
          Logger.log('MESSAGE_SEND', '📤 Sending message to AI...', { 
            messagePreview: message?.substring(0, 200) + '...'
          });
          
          const result = await chat.sendMessageStream(message);
          Logger.log('STREAM_START', '📥 Stream started, receiving chunks...');
          
          let totalChunks = 0;
          let fullResponse = '';
          
          // FAST STREAM LOOP
          for await (const chunk of result.stream) {
            // 1. Keep-Alive timer reset
            lastActivityTime = Date.now(); 
            
            // 2. Get text immediately
            const text = chunk.text();
            
            // 3. Send to frontend INSTANTLY (No logging logic delay here)
            if (text) {
              // Direct send without waiting
              controller.enqueue(encoder.encode(text));
              
              // Accumulate for final log only (don't log inside loop to save time)
              fullResponse += text;
              totalChunks++;
            }
          }
          
          stopKeepAlive();
          
          // Final Log only once at the end
          Logger.log('STREAM_COMPLETE', '✅ Stream completed', { 
            totalChunks, 
            responseLength: fullResponse.length,
            preview: fullResponse.substring(0, 100) + '...'
          });
          
          controller.close();
          
        } catch (streamError) {
          stopKeepAlive();
          
          Logger.error('STREAM_ERROR', '❌ Error during streaming', {
            name: streamError.name,
            message: streamError.message,
            stack: streamError.stack?.substring(0, 500)
          });
          
          // Send error response that frontend can detect and parse
          const errorResponse = JSON.stringify({
            error: true,
            errorType: streamError.name || 'StreamError',
            errorMessage: streamError.message,
            errorCode: streamError.code || 'UNKNOWN',
            replyText: `❌ AI Error: ${streamError.message}. कृपया दोबारा try करें।`,
            metadata: {
              reportTitle: "Error Report",
              preparedBy: "System",
              preparedDate: new Date().toLocaleDateString('en-IN')
            },
            highlights: [`Error occurred: ${streamError.message}`],
            sheets: [],
            timestamp: new Date().toISOString()
          });
          
          send('\n' + errorResponse);
          controller.close();
        }
      },
    });

    Logger.log('RESPONSE_READY', '📤 Returning stream response');
    
    return new Response(stream, { 
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8', 
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*',
      } 
    });

  } catch (error) {
    Logger.error('FATAL_ERROR', '💀 Handler fatal error', {
      name: error.name,
      message: error.message,
      stack: error.stack?.substring(0, 500)
    });
    
    return new Response(JSON.stringify({ 
      error: true,
      errorType: error.name || 'FatalError',
      errorMessage: error.message,
      replyText: `❌ Server Error: ${error.message}. कृपया page refresh करें और दोबारा try करें।`,
      metadata: {
        reportTitle: "Server Error",
        preparedBy: "System",
        preparedDate: new Date().toLocaleDateString('en-IN')
      },
      sheets: [],
      timestamp: new Date().toISOString()
    }), { 
      status: 500, 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      } 
    });
  }
}

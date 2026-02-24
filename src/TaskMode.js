import React, { useState, useEffect, useRef, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ============================================================================
// CONSOLE LOGGER - For Debugging (All checkpoints visible in browser console)
// ============================================================================
const Logger = {
  checkpoints: [],
  
  log: (checkpoint, message, data = null) => {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, checkpoint, message, data };
    Logger.checkpoints.push(entry);
    
    const style = 'background: #1E40AF; color: white; padding: 2px 6px; border-radius: 3px;';
    console.log(`%c[${checkpoint}]`, style, message);
    if (data) {
      console.log('📦 Data:', data);
    }
  },
  
  warn: (checkpoint, message, data = null) => {
    const timestamp = new Date().toISOString();
    Logger.checkpoints.push({ timestamp, checkpoint, message, data, level: 'warn' });
    console.warn(`⚠️ [${checkpoint}]`, message, data || '');
  },
  
  error: (checkpoint, message, error = null) => {
    const timestamp = new Date().toISOString();
    Logger.checkpoints.push({ timestamp, checkpoint, message, error: error?.message, level: 'error' });
    console.error(`❌ [${checkpoint}]`, message, error || '');
  },
  
  getAll: () => Logger.checkpoints,
  
  clear: () => { Logger.checkpoints = []; }
};

// Make logger globally accessible for debugging
if (typeof window !== 'undefined') {
  window.VirtualCALogger = Logger;
}

// ============================================================================
// ROBUST JSON PARSER - With Auto-Recovery for Incomplete JSON
// ============================================================================
const robustJSONParse = (text) => {
  Logger.log('JSON_PARSE_START', 'Starting JSON parsing', { inputLength: text?.length || 0 });
  
  if (!text) {
    Logger.warn('JSON_PARSE', 'Empty input received');
    return null;
  }

  // Step 1: Clean the text
  let cleanText = text
    .trim()
    // Remove zero-width spaces (keep-alive signals)
    .replace(/\u200B/g, '')
    // Remove markdown code blocks
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    // Remove Python f-string artifacts
    .replace(/:\s*f"/g, ': "')
    .replace(/"formula"\s*:\s*([a-zA-Z0-9+\-*/()]+)(?=\s*[,}])/g, '"formula": "$1"')
    .replace(/,\s*f"/g, ', "')
    .replace(/\[\s*f"/g, '["')
    // Remove any BOM characters
    .replace(/^\uFEFF/, '')
    // Remove multiple spaces that might have been keep-alive signals
    .replace(/\s{10,}/g, ' ');

  Logger.log('JSON_CLEANED', 'Text cleaned', { cleanedLength: cleanText.length });

  // Step 2: Try direct parse
  try {
    const result = JSON.parse(cleanText);
    Logger.log('JSON_PARSE_SUCCESS', 'Direct parse successful');
    return result;
  } catch (e) {
    Logger.warn('JSON_DIRECT_FAIL', 'Direct parse failed, trying extraction', e.message);
  }

  // Step 3: Extract JSON object from text
  try {
    const firstOpen = cleanText.indexOf('{');
    const lastClose = cleanText.lastIndexOf('}');
    
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      let extracted = cleanText.substring(firstOpen, lastClose + 1);
      Logger.log('JSON_EXTRACTED', 'Extracted JSON portion', { extractedLength: extracted.length });
      
      try {
        const result = JSON.parse(extracted);
        Logger.log('JSON_EXTRACT_SUCCESS', 'Extracted JSON parsed successfully');
        return result;
      } catch (e2) {
        Logger.warn('JSON_EXTRACT_FAIL', 'Extracted parse failed, attempting repair');
      }
    }
  } catch (e) {
    Logger.error('JSON_EXTRACT_ERROR', 'Extraction error', e);
  }

  // Step 4: Auto-repair incomplete JSON
  try {
    Logger.log('JSON_REPAIR_START', 'Attempting JSON auto-repair');
    let repaired = cleanText;
    
    // Find the JSON start
    const jsonStart = repaired.indexOf('{');
    if (jsonStart === -1) {
      Logger.warn('JSON_NO_START', 'No JSON object found');
      return null;
    }
    repaired = repaired.substring(jsonStart);
    
    // Count brackets and braces
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
      }
    }
    
    Logger.log('JSON_BRACKET_COUNT', 'Bracket analysis', { braceCount, bracketCount, inString });
    
    // Auto-close string if we're inside one
    if (inString) {
      repaired += '"';
      Logger.log('JSON_FIX', 'Closed unclosed string');
    }
    
    // Remove trailing comma before closing
    repaired = repaired.replace(/,\s*$/, '');
    
    // Auto-close brackets and braces
    while (bracketCount > 0) {
      repaired += ']';
      bracketCount--;
    }
    while (braceCount > 0) {
      repaired += '}';
      braceCount--;
    }
    
    Logger.log('JSON_REPAIRED', 'Repaired JSON', { repairedLength: repaired.length });
    
    const result = JSON.parse(repaired);
    Logger.log('JSON_REPAIR_SUCCESS', 'Repaired JSON parsed successfully');
    return result;
    
  } catch (e) {
    Logger.error('JSON_REPAIR_FAIL', 'JSON repair failed', e);
  }

  // Step 5: Last resort - try to extract at least the replyText
  try {
    const replyMatch = cleanText.match(/"replyText"\s*:\s*"([^"]+)"/);
    if (replyMatch) {
      Logger.warn('JSON_PARTIAL', 'Extracted partial data (replyText only)');
      return {
        replyText: replyMatch[1],
        sheets: [],
        error: 'Partial data recovered - full JSON was incomplete'
      };
    }
  } catch (e) {
    Logger.error('JSON_PARTIAL_FAIL', 'Partial extraction failed', e);
  }

  Logger.error('JSON_TOTAL_FAIL', 'All JSON parsing attempts failed');
  return null;
};

// ============================================================================
// LIGHTWEIGHT EXTRACTOR (FOR STREAMING ONLY)
// ============================================================================
const extractLiveText = (text) => {
  // Regex to safely extract 'replyText' even if JSON is broken
  const match = text.match(/"replyText"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (match && match[1]) {
    // Unescape newlines and quotes for display
    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  return '';
};

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================
const ProgressBar = ({ progress, phase }) => {
  return (
    <div className="w-full max-w-md mx-auto mt-2 px-4">
      <div className="flex justify-between text-xs font-semibold text-blue-700 mb-1">
        <span className="animate-pulse">⚡ {phase}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden">
        <div 
          className="bg-gradient-to-r from-blue-500 to-teal-400 h-2.5 rounded-full transition-all duration-300 ease-out" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// ERROR DISPLAY COMPONENT
// ============================================================================
const ErrorDisplay = ({ error, onRetry }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">❌</span>
        <div className="flex-1">
          <h4 className="font-bold text-red-700">Error Occurred</h4>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          {onRetry && (
            <button 
              onClick={onRetry}
              className="mt-3 bg-red-600 text-white px-4 py-1 rounded text-sm hover:bg-red-700"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN TASK MODE COMPONENT
// ============================================================================
const TaskMode = ({ onBack, userProfile, currentKeyIndex, tasks, onUpdateTasks }) => {
  const [view, setView] = useState('dashboard');
  const [activeTaskId, setActiveTaskId] = useState(null);

  Logger.log('TASKMODE_RENDER', 'TaskMode rendered', { view, activeTaskId, taskCount: tasks?.length || 0 });

  // File Reader with Progress Updates
  const readFileContent = useCallback(async (file, updateProgress) => {
    Logger.log('FILE_READ_START', 'Starting file read', { fileName: file.name, fileType: file.type, fileSize: file.size });
    
    return new Promise(async (resolve, reject) => {
      try {
        // Excel Files
        if (file.name.match(/\.(xlsx|xls)$/i)) {
          Logger.log('FILE_TYPE', 'Excel file detected');
          if (updateProgress) updateProgress(10, "Loading Excel library...");
          
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              if (!window.XLSX) {
                throw new Error("SheetJS (XLSX) library not loaded. Please refresh the page.");
              }
              
              if (updateProgress) updateProgress(30, "Parsing Excel sheets...");
              const workbook = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
              
              let csvContent = '';
              const totalSheets = workbook.SheetNames.length;
              
              workbook.SheetNames.forEach((sheetName, idx) => {
                if (updateProgress) {
                  updateProgress(30 + (idx / totalSheets) * 50, `Processing sheet: ${sheetName}`);
                }
                csvContent += `\n--- Sheet: ${sheetName} ---\n`;
                csvContent += window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
              });
              
              Logger.log('FILE_READ_SUCCESS', 'Excel read complete', { sheets: totalSheets, contentLength: csvContent.length });
              if (updateProgress) updateProgress(90, "Excel processed successfully");
              resolve({ name: file.name, content: csvContent, type: 'excel', sheets: totalSheets });
              
            } catch (err) {
              Logger.error('FILE_READ_ERROR', 'Excel parsing error', err);
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsArrayBuffer(file);
        }
        // PDF Files
        else if (file.type === 'application/pdf') {
          Logger.log('FILE_TYPE', 'PDF file detected');
          if (updateProgress) updateProgress(10, "Loading PDF library...");
          
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              if (!window.pdfjsLib) {
                throw new Error("PDF.js library not loaded. Please refresh the page.");
              }
              
              if (updateProgress) updateProgress(20, "Parsing PDF...");
              const pdf = await window.pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
              
              let fullText = '';
              const totalPages = pdf.numPages;
              
              for (let i = 1; i <= totalPages; i++) {
                if (updateProgress) {
                  updateProgress(20 + (i / totalPages) * 70, `Reading page ${i}/${totalPages}`);
                }
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += `\n--- Page ${i} ---\n`;
                fullText += textContent.items.map(item => item.str).join(' ') + '\n';
              }
              
              Logger.log('FILE_READ_SUCCESS', 'PDF read complete', { pages: totalPages, contentLength: fullText.length });
              if (updateProgress) updateProgress(95, "PDF processed successfully");
              resolve({ name: file.name, content: fullText, type: 'pdf', pages: totalPages });
              
            } catch (err) {
              Logger.error('FILE_READ_ERROR', 'PDF parsing error', err);
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsArrayBuffer(file);
        }
        // Text/CSV Files
        else {
          Logger.log('FILE_TYPE', 'Text file detected');
          if (updateProgress) updateProgress(30, "Reading text file...");
          
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target.result;
            Logger.log('FILE_READ_SUCCESS', 'Text read complete', { contentLength: content.length });
            if (updateProgress) updateProgress(90, "File loaded");
            resolve({ name: file.name, content: content, type: 'text' });
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(file);
        }
      } catch (err) {
        Logger.error('FILE_READ_FATAL', 'Fatal file read error', err);
        resolve({ name: file.name, content: `Error reading file: ${err.message}`, type: 'error' });
      }
    });
  }, []);

  const createNewTask = useCallback(() => {
    Logger.log('TASK_CREATE', 'Creating new task');
    const newTask = { 
      id: `task_${Date.now()}`, 
      name: 'New Project', 
      createdAt: Date.now(), 
      rawFiles: [], 
      refFiles: [], 
      history: [], 
      lastOutput: null 
    };
    onUpdateTasks([...tasks, newTask]);
    setActiveTaskId(newTask.id);
    setView('workspace');
  }, [tasks, onUpdateTasks]);

  const handleDeleteTask = useCallback((e, id) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this task?")) {
      Logger.log('TASK_DELETE', 'Deleting task', { taskId: id });
      onUpdateTasks(tasks.filter(t => t.id !== id));
    }
  }, [tasks, onUpdateTasks]);

  const openTask = useCallback((taskId) => {
    Logger.log('TASK_OPEN', 'Opening task', { taskId });
    setActiveTaskId(taskId);
    setView('workspace');
  }, []);

  // Dashboard View
  if (view === 'dashboard') {
    return (
      <div className="flex flex-col h-full bg-gray-100 p-6">
        <button 
          onClick={onBack} 
          className="mb-4 text-blue-600 font-bold w-fit flex items-center gap-1 hover:text-blue-800 transition-colors"
        >
          <span>⬅</span> Back to Home
        </button>
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">My Projects</h2>
          <button 
            onClick={createNewTask} 
            className="bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition"
          >
            + New Task
          </button>
        </div>
        
        {tasks.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-5xl mb-4">📁</p>
            <p>No tasks found. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(t => (
              <div 
                key={t.id} 
                onClick={() => openTask(t.id)} 
                className="bg-white p-5 rounded-lg shadow-sm cursor-pointer hover:shadow-md border border-gray-200 relative group transition-all"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-700 truncate pr-8">{t.name}</h3>
                  <button 
                    onClick={(e) => handleDeleteTask(e, t.id)}
                    className="text-gray-300 hover:text-red-600 absolute top-4 right-4 p-1 rounded transition-colors"
                    title="Delete Task"
                  >
                    🗑️
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(t.createdAt).toLocaleDateString('en-IN')}
                </p>
                <div className="mt-4 flex gap-3 text-xs text-gray-400 font-medium">
                  <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">
                    {t.rawFiles.length + t.refFiles.length} Files
                  </span>
                  <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded">
                    {t.history.length} Msgs
                  </span>
                  {t.lastOutput && (
                    <span className="bg-green-50 text-green-600 px-2 py-1 rounded">
                      ✓ Output Ready
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Workspace View
  const activeTask = tasks.find(t => t.id === activeTaskId);
  
  if (!activeTask) {
    Logger.warn('TASK_NOT_FOUND', 'Active task not found, returning to dashboard');
    setView('dashboard');
    return null;
  }

  return (
    <Workspace 
      task={activeTask} 
      updateTask={(updatedTask) => {
        Logger.log('TASK_UPDATE', 'Updating task', { taskId: updatedTask.id });
        onUpdateTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
      }} 
      onBack={() => {
        Logger.log('WORKSPACE_BACK', 'Returning to dashboard');
        setView('dashboard');
      }} 
      userProfile={userProfile} 
      currentKeyIndex={currentKeyIndex} 
      readFileContent={readFileContent} 
    />
  );
};

// ============================================================================
// WORKSPACE COMPONENT
// ============================================================================
const Workspace = ({ task, updateTask, onBack, userProfile, currentKeyIndex, readFileContent }) => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [liveMessage, setLiveMessage] = useState(''); // <--- ADD THIS
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  

  Logger.log('WORKSPACE_RENDER', 'Workspace rendered', { 
    taskId: task.id, 
    taskName: task.name,
    historyLength: task.history.length,
    hasOutput: !!task.lastOutput 
  });

  // ============================================================================
  // HTML GENERATOR - Universal renderer for all sheet types
  // ============================================================================
  const renderSheetsToHTML = useCallback((sheets) => {
    Logger.log('HTML_RENDER_START', 'Rendering sheets to HTML', { sheetCount: sheets?.length || 0 });
    
    if (!sheets || sheets.length === 0) {
      return "<p class='text-gray-500 text-center py-10'>No structured data available.</p>";
    }
    
    return sheets.map((sheet, sIdx) => {
      Logger.log('HTML_SHEET', `Rendering sheet ${sIdx + 1}`, { sheetName: sheet.sheetName, sheetType: sheet.sheetType });
      
      // Handle paragraph/text type sheets
      if (sheet.sheetType === 'paragraph' && sheet.content) {
        return `
          <div class="sheet-container mb-8 border rounded-lg p-6 shadow-sm bg-white">
            <h3 class="text-lg font-bold mb-4 text-blue-800 border-b pb-2">
              ${sheet.sheetName || `Section ${sIdx + 1}`}
            </h3>
            <div class="prose max-w-none">
              ${sheet.content.map(item => {
                if (item.type === 'heading') {
                  return `<h4 class="font-bold text-lg mt-4 mb-2" style="${item.style?.bold ? 'font-weight:bold;' : ''}">${item.text}</h4>`;
                }
                if (item.type === 'paragraph') {
                  return `<p class="mb-3 text-gray-700">${item.text}</p>`;
                }
                if (item.type === 'bullet_list') {
                  return `<ul class="list-disc pl-6 mb-3">${item.items.map(i => `<li class="mb-1">${i}</li>`).join('')}</ul>`;
                }
                if (item.type === 'numbered_list') {
                  return `<ol class="list-decimal pl-6 mb-3">${item.items.map(i => `<li class="mb-1">${i}</li>`).join('')}</ol>`;
                }
                return '';
              }).join('')}
            </div>
          </div>
        `;
      }
      
      // Handle table type sheets
      return `
        <div class="sheet-container mb-8 border rounded-lg shadow-sm bg-white overflow-hidden">
          <div class="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
            <h3 class="font-bold text-blue-800">
              ${sheet.sheetName || `Sheet ${sIdx + 1}`}
            </h3>
            <span class="text-xs text-gray-400">Virtual CA</span>
          </div>
          <div class="overflow-x-auto p-4">
            <table class="w-full border-collapse text-sm" style="min-width: 600px;">
            
              <tbody>
                ${(sheet.rows || []).map((row, rowIdx) => {
                  const values = row.values || row;
                  const style = row.style || {};
                  const rowType = row.rowType || 'data';
                  
                  // Build inline styles
                  let styleStr = '';
                  if (style.bg) styleStr += `background-color:#${style.bg.replace('#','')};`;
                  if (style.color) styleStr += `color:#${style.color.replace('#','')};`;
                  if (style.bold) styleStr += `font-weight:bold;`;
                  if (style.italic) styleStr += `font-style:italic;`;
                  if (style.fontSize) styleStr += `font-size:${style.fontSize}px;`;
                  
                  // Row type specific styling
                  let rowClass = 'hover:bg-gray-50 transition-colors';
                  if (rowType === 'title' || rowType === 'header') rowClass = 'bg-blue-50';
                  if (rowType === 'total') rowClass = 'bg-gray-100 font-bold';
                  if (rowType === 'subtotal') rowClass = 'bg-gray-50';
                  
                  // Handle merged rows
                  if (style.mergeAcross) {
                    const colSpan = typeof style.mergeAcross === 'number' 
                      ? style.mergeAcross + 1 
                      : (sheet.columns?.length || 10);
                    
                    return `
                      <tr class="${rowClass}">
                        <td colspan="${colSpan}" 
                            style="${styleStr} padding:10px; border:1px solid #e5e7eb; text-align:${style.align || 'left'};">
                          ${formatCellValue(values[0])}
                        </td>
                      </tr>
                    `;
                  }
                  
                  // Standard rows
                  return `
                    <tr class="${rowClass}">
                      ${values.map((val, colIdx) => {
                        const cellAlign = style.align || (typeof val === 'number' ? 'right' : 'left');
                        const indent = style.indent ? `padding-left: ${style.indent * 20}px;` : '';
                        const borderStyle = style.border === 'double' 
                          ? 'border-bottom: 3px double #333;' 
                          : 'border: 1px solid #e5e7eb;';
                        
                        return `
                          <td style="${styleStr} ${indent} ${borderStyle} padding:8px; text-align:${cellAlign};">
                            ${formatCellValue(val)}
                          </td>
                        `;
                      }).join('')}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }, []);

  // Format cell value for display
  const formatCellValue = (val) => {
    if (val === null || val === undefined) return '';
    
    // Handle formula objects
    if (typeof val === 'object' && val !== null) {
      if (val.formula) {
        const displayVal = val.result !== undefined ? val.result : val.formula;
        return typeof displayVal === 'number' 
          ? displayVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : displayVal;
      }
      if (val.hyperlink) {
        return `<a href="${val.hyperlink}" class="text-blue-600 underline hover:text-blue-800">${val.display || val.hyperlink}</a>`;
      }
      return JSON.stringify(val);
    }
    
    // Format numbers with Indian notation
    if (typeof val === 'number') {
      return val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
    
    return String(val);
  };

  // ============================================================================
  // EXCEL GENERATOR - With Full Formula & Styling Support
  // ============================================================================
  const generateUniversalExcel = useCallback(async (output) => {
    Logger.log('EXCEL_START', 'Starting Excel generation');
    
    if (!output) {
      Logger.warn('EXCEL_NO_OUTPUT', 'No output data for Excel');
      return;
    }

    const sheetsToRender = output.sheets || [];
    if (sheetsToRender.length === 0) {
      Logger.warn('EXCEL_NO_SHEETS', 'No sheets to render');
      alert('No data available to export');
      return;
    }

    const fileName = `${task.name.replace(/[^a-zA-Z0-9]/g, '_')}_Analysis_${Date.now()}.xlsx`;
    setPhase('Creating Excel file...');
    setProgress(10);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Virtual CA - Sumit Garg';
      workbook.lastModifiedBy = 'Virtual CA';
      workbook.created = new Date();
      workbook.modified = new Date();

      Logger.log('EXCEL_WORKBOOK', 'Workbook created', { sheetCount: sheetsToRender.length });

      sheetsToRender.forEach((sheetData, sheetIdx) => {
        Logger.log('EXCEL_SHEET_START', `Processing sheet ${sheetIdx + 1}`, { sheetName: sheetData.sheetName });
        setProgress(10 + (sheetIdx / sheetsToRender.length) * 70);
        setPhase(`Processing: ${sheetData.sheetName || `Sheet ${sheetIdx + 1}`}`);

        const sheet = workbook.addWorksheet(
          sheetData.sheetName?.substring(0, 31) || `Sheet${sheetIdx + 1}`,
          {
            pageSetup: {
              orientation: sheetData.orientation === 'landscape' ? 'landscape' : 'portrait',
              fitToPage: true,
              fitToWidth: 1,
              margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
            }
          }
        );

        // Setup columns
        if (sheetData.columns && sheetData.columns.length > 0) {
          sheet.columns = sheetData.columns.map(col => ({
          //  header: col.header || '',
            key: col.key || col.header,
            width: col.width || 15,
            style: col.dataType === 'currency' ? { numFmt: '#,##,##0.00' } : undefined
          }));
          Logger.log('EXCEL_COLUMNS', 'Columns set', { count: sheetData.columns.length });
        }

        // Track merged cells to avoid conflicts
        const mergedRanges = new Set();

        // Process rows
        if (sheetData.rows && sheetData.rows.length > 0) {
          sheetData.rows.forEach((rowData, rowIdx) => {
            const values = rowData.values || rowData;
            const style = rowData.style || {};
            const rowType = rowData.rowType || 'data';

            // Process cell values - handle formulas
            const processedValues = values.map(val => {
              if (val === null || val === undefined) return null;

              // Handle Objects (Formula or Hyperlink)
              if (typeof val === 'object' && val !== null) {
                if (val.formula) {
                  return { 
                    formula: val.formula.startsWith('=') ? val.formula.substring(1) : val.formula, 
                    result: val.result 
                  };
                }
                if (val.hyperlink) {
                  return { text: val.display || val.hyperlink, hyperlink: val.hyperlink };
                }
                return JSON.stringify(val);
              }

              // Handle Numeric Strings: "5000" -> 5000
              if (typeof val === 'string' && !isNaN(val) && val.trim() !== '') {
                return parseFloat(val);
              }

              return val;
            });

            const row = sheet.addRow(processedValues);
            const rowNum = row.number;

            // Apply cell-level formatting
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const val = processedValues[colNumber - 1];
              
              // Apply styles
              if (style.bold) cell.font = { ...cell.font, bold: true };
              if (style.italic) cell.font = { ...cell.font, italic: true };
              if (style.fontSize) cell.font = { ...cell.font, size: style.fontSize };
              if (style.color) {
                cell.font = { ...cell.font, color: { argb: 'FF' + style.color.replace('#', '') } };
              }
              if (style.bg) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FF' + style.bg.replace('#', '') }
                };
              }
              if (style.underline) cell.font = { ...cell.font, underline: true };
              
              // Alignment
              cell.alignment = {
                horizontal: style.align || (typeof val === 'number' ? 'right' : 'left'),
                vertical: style.valign || 'middle',
                wrapText: style.wrapText || false,
                indent: style.indent || 0
              };

              // Borders
              if (style.border === 'all' || style.border === 'thin') {
                cell.border = {
                  top: { style: 'thin' },
                  left: { style: 'thin' },
                  bottom: { style: 'thin' },
                  right: { style: 'thin' }
                };
              } else if (style.border === 'double') {
                cell.border = { bottom: { style: 'double' } };
              } else if (style.border === 'top') {
                cell.border = { top: { style: 'thin' } };
              } else if (style.border === 'bottom') {
                cell.border = { bottom: { style: 'thin' } };
              }

              // Hyperlinks styling
              if (typeof val === 'object' && val?.hyperlink) {
                cell.value = { text: val.text, hyperlink: val.hyperlink };
                cell.font = { ...cell.font, color: { argb: 'FF0000FF' }, underline: true };
              }
            });

            // Handle row merging
            if (style.mergeAcross) {
              const colCount = sheet.columns?.length || values.length || 5;
              const mergeEnd = typeof style.mergeAcross === 'number' 
                ? Math.min(style.mergeAcross + 1, colCount) 
                : colCount;
              
              const mergeRange = `A${rowNum}:${String.fromCharCode(64 + mergeEnd)}${rowNum}`;
              
              // Check for conflicts
              if (!mergedRanges.has(mergeRange)) {
                try {
                  sheet.mergeCells(mergeRange);
                  mergedRanges.add(mergeRange);
                } catch (e) {
                  Logger.warn('EXCEL_MERGE_FAIL', 'Merge failed', { range: mergeRange });
                }
              }
            }

            // Row height for titles
            if (rowType === 'title') {
              row.height = 25;
            }
          });

          Logger.log('EXCEL_ROWS', 'Rows processed', { count: sheetData.rows.length });
        }

        // Apply explicit merges from sheet data
        if (sheetData.merges && Array.isArray(sheetData.merges)) {
          sheetData.merges.forEach(range => {
            if (!mergedRanges.has(range)) {
              try {
                sheet.mergeCells(range);
                mergedRanges.add(range);
              } catch (e) {
                Logger.warn('EXCEL_EXPLICIT_MERGE_FAIL', 'Explicit merge failed', { range });
              }
            }
          });
        }

        // Freeze panes
        if (sheetData.freezePane) {
          sheet.views = [{
            state: 'frozen',
            xSplit: sheetData.freezePane.col || 0,
            ySplit: sheetData.freezePane.row || 0
          }];
        }

        // Print area
        if (sheetData.printArea) {
          sheet.pageSetup.printArea = sheetData.printArea;
        }
      });

      // Generate and download
      setProgress(90);
      setPhase('Generating file...');
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      saveAs(blob, fileName);
      
      Logger.log('EXCEL_SUCCESS', 'Excel file generated successfully', { fileName });
      setPhase('Download started! ✅');
      setProgress(100);

    } catch (error) {
      Logger.error('EXCEL_ERROR', 'Excel generation failed', error);
      alert(`Excel creation failed: ${error.message}`);
      setPhase('Failed ❌');
    } finally {
      setTimeout(() => {
        setPhase('');
        setProgress(0);
      }, 2000);
    }
  }, [task.name]);

 // OTHER FORMAT EXPORTS (PDF, Word, HTML)
  // ============================================================================
  const downloadOtherFormats = useCallback((output, format) => {
    Logger.log('EXPORT_START', 'Starting export', { format });
    
    if (!output) {
      alert('No data available to export');
      return;
    }
    
    const fileName = `${task.name.replace(/[^a-zA-Z0-9]/g, '_')}_Report`;
    const generatedHTML = output.sheets ? renderSheetsToHTML(output.sheets) : '<h1>No Data Available</h1>';

    // 1. Metadata Section (Report Details)
    const metadataHTML = output.metadata ? `
      <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border: 1px solid #ddd;">
        <h2 style="color: #1e40af; margin: 0;">${output.metadata.reportTitle || task.name}</h2>
        <p style="font-size: 11pt; color: #555; margin-top: 5px;">
          <strong>Prepared by:</strong> ${output.metadata.preparedBy || 'Virtual CA'}<br/>
          <strong>Date:</strong> ${output.metadata.preparedDate || new Date().toLocaleDateString('en-IN')}<br/>
          <strong>Financial Year:</strong> ${output.metadata.financialYear || 'N/A'}
        </p>
      </div>
    ` : '';

    // 2. Highlights Section
    const highlightsHTML = output.highlights && output.highlights.length > 0 ? `
      <div style="margin-bottom: 20px; padding: 15px; background-color: #e8f5e9; border: 1px solid #4caf50;">
        <h3 style="color: #2e7d32; margin: 0;">Key Highlights</h3>
        <ul style="margin-top: 5px;">
          ${output.highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    // 3. Word Specific CSS (Borders & Layout Fix)
    const wordCSS = `
      <style>
        @page { size: A4; margin: 1in; }
        body { font-family: 'Calibri', sans-serif; font-size: 11pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f2f2f2; border: 1px solid #000; padding: 8px; font-weight: bold; }
        td { border: 1px solid #000; padding: 8px; }
        .sheet-container { page-break-after: always; }
      </style>
    `;

    // 4. Full HTML with XML Namespace (Crucial for Word Layout)
    const fullHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${task.name}</title>
        ${wordCSS}
        </head>
      <body>
        ${metadataHTML}
        ${highlightsHTML}
        ${generatedHTML}
        <br/><p style="text-align: center; color: #888; font-size: 9pt;">Generated by Virtual CA</p>
      </body>
      </html>
    `;

    if (format === 'html') {
      const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
      saveAs(blob, `${fileName}.html`);
      Logger.log('EXPORT_SUCCESS', 'HTML exported');
    }
    else if (format === 'word') {
      const blob = new Blob(['\ufeff', fullHTML], { type: 'application/msword' });
      saveAs(blob, `${fileName}.doc`);
      Logger.log('EXPORT_SUCCESS', 'Word exported');
    }
    else if (format === 'pdf') {
      if (!window.html2pdf) {
        alert('PDF library is loading...');
        return;
      }
      const element = document.createElement('div');
      element.innerHTML = fullHTML;
      const opt = {
        margin: 10,
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      window.html2pdf().set(opt).from(element).save();
    }
  }, [task.name, renderSheetsToHTML]);

  // ============================================================================
  // FILE UPLOAD HANDLER
  // ============================================================================
  const handleUpload = useCallback(async (e, type) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    Logger.log('UPLOAD_START', 'File upload started', { fileCount: files.length, type });
    setIsProcessing(true);
    setError(null);
    
    const processed = [];
    
    for (let i = 0; i < files.length; i++) {
      setPhase(`Reading file ${i + 1}/${files.length}: ${files[i].name}`);
      setProgress((i / files.length) * 100);
      
      try {
        const result = await readFileContent(files[i], (pct, msg) => {
          setProgress((i / files.length) * 100 + (pct / files.length));
          setPhase(msg);
        });
        processed.push(result);
        Logger.log('UPLOAD_FILE_SUCCESS', 'File processed', { fileName: result.name });
      } catch (err) {
        Logger.error('UPLOAD_FILE_ERROR', 'File processing failed', err);
        processed.push({ name: files[i].name, content: `Error: ${err.message}`, type: 'error' });
      }
    }

    const updated = { ...task };
    if (type === 'raw') {
      updated.rawFiles = [...updated.rawFiles, ...processed];
    } else {
      updated.refFiles = [...updated.refFiles, ...processed];
    }
    
    updateTask(updated);
    setIsProcessing(false);
    setProgress(0);
    setPhase('');
    
    Logger.log('UPLOAD_COMPLETE', 'All files uploaded', { totalFiles: processed.length });
    
    // Reset input
    e.target.value = '';
  }, [task, updateTask, readFileContent]);

  // ============================================================================
  // REMOVE FILE HANDLER
  // ============================================================================
  const removeFile = useCallback((type, index) => {
    if (!window.confirm("Remove this file?")) return;
    
    Logger.log('FILE_REMOVE', 'Removing file', { type, index });
    const updated = { ...task };
    
    if (type === 'raw') {
      updated.rawFiles = updated.rawFiles.filter((_, i) => i !== index);
    } else {
      updated.refFiles = updated.refFiles.filter((_, i) => i !== index);
    }
    
    updateTask(updated);
  }, [task, updateTask]);

  // ============================================================================
  // SEND MESSAGE TO AI (UPDATED WITH LIVE TYPING)
  // ============================================================================
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    
    Logger.log('SEND_START', 'Sending message', { inputLength: input.length });
    setError(null);
    setStreamingText('');
    setLiveMessage(''); // Clear previous live message
    
    // Add user message to history
    const userMessage = { 
      role: 'user', 
      text: input, 
      timestamp: Date.now() 
    };
    const tempHistory = [...task.history, userMessage];
    updateTask({ ...task, history: tempHistory });
    
    setInput('');
    setIsProcessing(true);
    setPhase('Initializing Virtual CA...');
    setProgress(5);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      // Prepare file contexts
      const rawContext = task.rawFiles.map((f, i) => 
        `[RAW_FILE_${i + 1}: ${f.name}]\n${f.content.substring(0, 1000000)}`
      ).join('\n\n');
      
      const refContext = task.refFiles.map((f, i) => 
        `[REFERENCE_FILE_${i + 1}: ${f.name}]\n${f.content.substring(0, 1000000)}`
      ).join('\n\n');
      
      const fullPrompt = `
USER INSTRUCTION: ${input}

=== ATTACHED DATA FILES (${task.rawFiles.length} files) ===
${rawContext || 'No data files attached'}

=== REFERENCE/FORMAT FILES (${task.refFiles.length} files) ===
${refContext || 'No reference files attached'}

IMPORTANT INSTRUCTIONS FOR JSON GENERATION:
1. Return ONLY a valid JSON response following the Universal JSON Structure.
2. ⚠️ CRITICAL SPEED OPTIMIZATION: 
   - OMIT ZERO VALUES.
   - SKIP EMPTY SECTIONS.
   - OUTPUT "replyText" FIRST in the JSON so I can stream it.
3. Ensure the JSON is valid and ends with "}".
      `.trim();

      // Prepare API history format
      const apiHistory = task.history.slice(-4).map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      setPhase('Connecting to AI...');
      setProgress(10);

      const response = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: apiHistory,
          message: fullPrompt,
          keyIndex: currentKeyIndex,
          userProfile: userProfile
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let chunkCount = 0;
      let lastParseTime = 0; // Throttle control
      
      setPhase('Receiving AI response...');
      
      // ---------------------------------------------------------
      // LIVE STREAMING LOOP
      // ---------------------------------------------------------
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        chunkCount++;
        
        // Update raw preview (optional, for debug)
        const cleanPreview = fullText.replace(/\u200B/g, '');
        setStreamingText(cleanPreview.substring(0, 500));
        
        // --- REAL-TIME TYPING LOGIC ---
        // Extract text every 100ms to avoid freezing UI
        const now = Date.now();
        if (now - lastParseTime > 100) {
           const currentText = extractLiveText(fullText);
           if (currentText) {
             setLiveMessage(currentText);
           }
           
           // Detect if we are moving to tables/data phase
           if (fullText.includes('"sheets"')) {
             setPhase('Generating Financial Tables...');
           } else if (fullText.includes('"highlights"')) {
             setPhase('Creating Highlights...');
           }
           
           lastParseTime = now;
        }

        // Update progress bar
        setProgress(prev => Math.min(prev + 0.5, 95));
      }

      // Final processing
      Logger.log('PARSE_START', 'Starting response parsing', { responseLength: fullText.length });
      setPhase('Finalizing Report...');
      setProgress(98);
      setLiveMessage(''); // Clear live message as we will now show final output

      // Parse the response
      const data = robustJSONParse(fullText);
      
      if (!data) {
        throw new Error('Failed to parse AI response.');
      }

      if (data.error && data.errorMessage) {
        setError(data.errorMessage);
      }

      // Create AI message
      const aiMessage = { 
        role: 'model', 
        text: data.replyText || data.errorMessage || 'Analysis Complete', 
        output: data, 
        timestamp: Date.now() 
      };

      updateTask({ 
        ...task, 
        history: [...tempHistory, aiMessage], 
        lastOutput: data 
      });

      setPhase('Done ✅');
      setProgress(100);

    } catch (error) {
      if (error.name === 'AbortError') {
        setPhase('Cancelled');
      } else {
        setError(error.message);
        setPhase('Failed ❌');
      }
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setStreamingText('');
        setLiveMessage('');
      }, 1000);
    }
  }, [input, task, updateTask, currentKeyIndex, userProfile]);
  

  // ============================================================================
  // CANCEL REQUEST
  // ============================================================================
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      Logger.log('REQUEST_CANCELLED', 'User cancelled the request');
    }
  }, []);

  // ============================================================================
  // AUTO-SCROLL TO BOTTOM OF MESSAGES
  // ============================================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task.history]);

  // ============================================================================
  // RENDER WORKSPACE
  // ============================================================================
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* HEADER */}
      <header className="bg-white border-b h-14 flex items-center shadow-sm relative z-20 px-4">
        <div className="absolute left-4 flex items-center gap-2">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors"
          >
            ⬅ Back
          </button>
          <input 
            value={task.name} 
            onChange={(e) => updateTask({ ...task, name: e.target.value })} 
            className="font-bold outline-none text-gray-700 hover:bg-gray-50 focus:bg-white border border-transparent focus:border-gray-300 rounded px-2 max-w-[200px]" 
          />
        </div>
        
        <div className="mx-auto font-black text-xl tracking-widest text-blue-900 uppercase">
          VIRTUAL CA
        </div>

        <div className="absolute right-4 flex gap-2 items-center">
          {task.lastOutput && (
            <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-200">
              ✓ Analysis Ready
            </span>
          )}
          {/* Debug button - shows console logs */}
          <button 
            onClick={() => console.log('📋 All Checkpoints:', Logger.getAll())}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            title="Show debug logs in console"
          >
            🔍 Debug
          </button>
        </div>
      </header>

      {/* PROGRESS BAR */}
      {isProcessing && (
        <div className="p-2 bg-blue-50 border-b">
          <ProgressBar progress={progress} phase={phase} />
          {streamingText && (
            <div className="mt-2 mx-4 p-2 bg-white rounded text-xs text-gray-500 max-h-20 overflow-hidden">
              <span className="font-semibold">Receiving: </span>
              {streamingText}
            </div>
          )}
          <div className="text-center mt-2">
            <button 
              onClick={handleCancel}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Cancel Request
            </button>
          </div>
        </div>
      )}

      {/* ERROR DISPLAY */}
      {error && <ErrorDisplay error={error} onRetry={() => setError(null)} />}

      {/* MAIN LAYOUT */}
      <div className="flex flex-grow overflow-hidden">
        
        {/* LEFT SIDEBAR: FILES */}
        <div className="w-64 bg-white border-r flex flex-col flex-shrink-0 z-10">
          <div className="p-4 overflow-y-auto flex-grow">
            {/* RAW FILES */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex justify-between">
                Analysis Data 
                <span className="bg-gray-200 text-gray-700 px-1 rounded">{task.rawFiles.length}</span>
              </h3>
              <label className="flex items-center justify-center border-2 border-dashed border-blue-300 p-3 rounded bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors">
                <span className="text-blue-600 text-sm font-bold">+ Upload Data</span>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  onChange={(e) => handleUpload(e, 'raw')}
                  accept=".xlsx,.xls,.csv,.txt,.pdf,.json"
                />
              </label>
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {task.rawFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border shadow-sm group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-blue-500">📄</span>
                      <span className="truncate w-32 font-medium" title={f.name}>{f.name}</span>
                    </div>
                    <button 
                      onClick={() => removeFile('raw', i)} 
                      className="text-gray-300 hover:text-red-500 p-1 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* REF FILES */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex justify-between">
                Reference / Format
                <span className="bg-gray-200 text-gray-700 px-1 rounded">{task.refFiles.length}</span>
              </h3>
              <label className="flex items-center justify-center border-2 border-dashed border-purple-300 p-3 rounded bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors">
                <span className="text-purple-600 text-sm font-bold">+ Upload Ref</span>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  onChange={(e) => handleUpload(e, 'ref')}
                  accept=".xlsx,.xls,.csv,.txt,.pdf,.json"
                />
              </label>
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {task.refFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border shadow-sm group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-purple-500">📎</span>
                      <span className="truncate w-32 font-medium" title={f.name}>{f.name}</span>
                    </div>
                    <button 
                      onClick={() => removeFile('ref', i)} 
                      className="text-gray-300 hover:text-red-500 p-1 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE: CHAT AREA */}
        <div className={`flex flex-col border-r bg-gray-50 transition-all duration-300 ${task.lastOutput ? 'w-1/3' : 'flex-1'}`}>
          <div className="flex-grow p-4 overflow-y-auto space-y-4">
            {task.history.length === 0 && (
              <div className="text-center text-gray-400 mt-10">
                <p className="text-4xl mb-4">💬</p>
                <p>Start by uploading files and typing your instruction.</p>
                <p className="text-sm mt-2">Example: "Prepare Balance Sheet from this Trial Balance"</p>
              </div>
            )}
              {task.history.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-lg max-w-[90%] shadow-sm text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white border text-gray-800'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.output?.highlights && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="font-semibold text-xs mb-1">Highlights:</p>
                      <ul className="text-xs list-disc pl-4">
                        {msg.output.highlights.slice(0, 3).map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* LIVE TYPING BUBBLE */}
            {isProcessing && liveMessage && (
              <div className="flex justify-start animate-fade-in">
                <div className="p-3 rounded-lg max-w-[90%] shadow-sm text-sm bg-white border text-gray-800 border-l-4 border-l-blue-500">
                  <p className="whitespace-pre-wrap">
                    {liveMessage}
                    <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-blue-500 animate-pulse"></span>
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-1 border-t border-gray-100">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <span className="text-xs text-blue-500 font-bold uppercase">AI Writing...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t flex gap-2 shadow-lg">
            <textarea 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-grow p-3 border rounded bg-gray-50 text-sm h-12 resize-none focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="Type instruction... (Enter to send, Shift+Enter for new line)" 
              disabled={isProcessing}
            />
            <button 
              onClick={handleSend} 
              disabled={isProcessing || !input.trim()} 
              className={`px-4 rounded font-bold transition-all text-sm ${
                isProcessing || !input.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isProcessing ? '...' : '➤'}
            </button>
          </div>
        </div>

        {/* RIGHT: PREVIEW PANEL */}
        {task.lastOutput && (
          <div className="flex-1 flex flex-col bg-white min-w-0">
            <div className="bg-gray-100 border-b p-2 flex justify-between items-center flex-shrink-0">
              <span className="text-xs font-bold text-gray-500 uppercase px-2">Live Preview</span>
              <span className="text-xs text-gray-400">
                {task.lastOutput.sheets?.length || 0} sheets
              </span>
            </div>
            
            {/* HTML PREVIEW */}
            <div className="flex-grow overflow-y-auto p-6">
              {task.lastOutput.error ? (
                <ErrorDisplay error={task.lastOutput.error || task.lastOutput.errorMessage} />
              ) : task.lastOutput.sheets ? (
                <div dangerouslySetInnerHTML={{ __html: renderSheetsToHTML(task.lastOutput.sheets) }} />
              ) : task.lastOutput.mainContentHTML ? (
                <div dangerouslySetInnerHTML={{ __html: task.lastOutput.mainContentHTML }} />
              ) : (
                <div className="text-center text-gray-400 mt-10">
                  <p>No Visual Preview Available</p>
                  <p className="text-xs">Check Chat for text response</p>
                </div>
              )}
            </div>

            {/* DOWNLOAD ACTIONS */}
            <div className="p-4 bg-gray-50 border-t grid grid-cols-2 gap-2 flex-shrink-0">
              <button 
                onClick={() => downloadOtherFormats(task.lastOutput, 'pdf')} 
                className="bg-white border border-red-200 text-red-600 px-3 py-2 rounded text-sm font-semibold hover:bg-red-50 flex items-center justify-center gap-1 shadow-sm transition-colors"
              >
                📄 PDF
              </button>
              <button 
                onClick={() => downloadOtherFormats(task.lastOutput, 'word')} 
                className="bg-white border border-blue-200 text-blue-600 px-3 py-2 rounded text-sm font-semibold hover:bg-blue-50 flex items-center justify-center gap-1 shadow-sm transition-colors"
              >
                📝 Word
              </button>
              <button 
                onClick={() => downloadOtherFormats(task.lastOutput, 'html')} 
                className="bg-white border border-purple-200 text-purple-600 px-3 py-2 rounded text-sm font-semibold hover:bg-purple-50 flex items-center justify-center gap-1 shadow-sm transition-colors"
              >
                🌐 HTML
              </button>
              <button 
                onClick={() => generateUniversalExcel(task.lastOutput)} 
                className="bg-green-600 text-white px-3 py-2 rounded text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-1 shadow-sm transition-colors"
              >
                📊 Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskMode;

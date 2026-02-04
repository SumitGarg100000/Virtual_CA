import React, { useState, useEffect, useRef } from 'react';

// --- HELPER: ROBUST JSON PARSER ---
const robustJSONParse = (text) => {
    try {
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        try {
            const firstOpen = text.indexOf('{');
            const lastClose = text.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                return JSON.parse(text.substring(firstOpen, lastClose + 1));
            }
        } catch (e2) { return null; }
    }
    return null;
};

// --- HELPER: PROGRESS BAR ---
const ProgressBar = ({ progress, phase }) => {
    return (
        <div className="w-full max-w-md mx-auto mt-2 px-4">
            <div className="flex justify-between text-xs font-semibold text-blue-700 mb-1">
                <span className="animate-pulse">⚡ {phase}</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-teal-400 h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const TaskMode = ({ onBack, userProfile, currentKeyIndex, tasks, onUpdateTasks }) => {
    const [view, setView] = useState('dashboard');
    const [activeTaskId, setActiveTaskId] = useState(null);

    // --- FILE READER ---
    const readFileContent = async (file, updateProgress) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (file.name.match(/\.(xlsx|xls)$/i)) {
                    if (updateProgress) updateProgress(20, "Reading Excel...");
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            if (!window.XLSX) throw new Error("SheetJS not loaded");
                            const workbook = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                            let csvContent = '';
                            workbook.SheetNames.forEach(sheetName => {
                                csvContent += `\n--- Sheet: ${sheetName} ---\n` + window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                            });
                            resolve({ name: file.name, content: csvContent });
                        } catch (err) { reject(err); }
                    };
                    reader.readAsArrayBuffer(file);
                } 
                else if (file.type === 'application/pdf') {
                    if (updateProgress) updateProgress(10, "Scanning PDF...");
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
                            const pdf = await window.pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
                            let fullText = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                                const page = await pdf.getPage(i);
                                const textContent = await page.getTextContent();
                                fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                            }
                            resolve({ name: file.name, content: fullText });
                        } catch (err) { reject(err); }
                    };
                    reader.readAsArrayBuffer(file);
                }
                else {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, content: e.target.result });
                    reader.readAsText(file);
                }
            } catch (err) {
                console.error("File Read Error:", err);
                resolve({ name: file.name, content: "Error: " + err.message });
            }
        });
    };

    const createNewTask = () => {
        const newTask = { id: `task_${Date.now()}`, name: 'New Project', createdAt: Date.now(), rawFiles: [], refFiles: [], history: [], lastOutput: null };
        onUpdateTasks([...tasks, newTask]);
        setActiveTaskId(newTask.id);
        setView('workspace');
    };

    const handleDeleteTask = (e, id) => {
        e.stopPropagation(); // Stop click from opening the task
        if(window.confirm("Are you sure you want to delete this task?")) {
            onUpdateTasks(tasks.filter(t => t.id !== id));
        }
    };

    if (view === 'dashboard') {
        return (
            <div className="flex flex-col h-full bg-gray-100 p-6">
                <button onClick={onBack} className="mb-4 text-blue-600 font-bold w-fit flex items-center gap-1">
                    <span>⬅</span> Back to Home
                </button>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">My Projects</h2>
                    <button onClick={createNewTask} className="bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition">+ New Task</button>
                </div>
                
                {tasks.length === 0 ? (
                    <div className="text-center text-gray-400 mt-20">No tasks found. Create one to get started!</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tasks.map(t => (
                            <div key={t.id} onClick={() => { setActiveTaskId(t.id); setView('workspace'); }} className="bg-white p-5 rounded-lg shadow-sm cursor-pointer hover:shadow-md border border-gray-200 relative group transition-all">
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
                                <p className="text-sm text-gray-500 mt-1">{new Date(t.createdAt).toLocaleDateString()}</p>
                                <div className="mt-4 flex gap-3 text-xs text-gray-400 font-medium">
                                    <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">{t.rawFiles.length + t.refFiles.length} Files</span>
                                    <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded">{t.history.length} Msgs</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <Workspace task={tasks.find(t => t.id === activeTaskId)} updateTask={(u) => onUpdateTasks(tasks.map(t => t.id === u.id ? u : t))} onBack={() => setView('dashboard')} userProfile={userProfile} currentKeyIndex={currentKeyIndex} readFileContent={readFileContent} />;
};

const Workspace = ({ task, updateTask, onBack, userProfile, currentKeyIndex, readFileContent }) => {
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState('');
    const messagesEndRef = useRef(null);

    // --- EXCEL PIPE ---
    const generateUniversalExcel = async (output) => {
        if(!output) return;
        const sheetsToRender = output.sheets || [];
        if (sheetsToRender.length === 0 && output.structuredTableData) {
            sheetsToRender.push({
                sheetName: "Report",
                columns: output.structuredTableData[0].map((h, i) => ({ header: h, key: `col${i}`, width: 20 })),
                rows: output.structuredTableData.slice(1).map(row => ({ values: row }))
            });
        }
        const fileName = `${task.name.replace(/\s+/g, '_')}_Analysis.xlsx`;

        try {
            setPhase('Connecting to Excel Pipe...');
            const response = await fetch('/api/stream-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheets: sheetsToRender, fileName: fileName }),
            });
            if (!response.ok) throw new Error("Excel Generation Failed");
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setPhase('Download Started ✅');
        } catch (error) {
            alert("Excel Error: " + error.message);
        } finally { setTimeout(() => setPhase(''), 2000); }
    };

    // --- OTHER EXPORTS ---
    const downloadOtherFormats = (output, format) => {
        if(!output) return;
        const fileName = `${task.name.replace(/\s+/g, '_')}_Report`;
        if (format === 'html') {
            const blob = new Blob([output.mainContentHTML || "<h1>No Data</h1>"], { type: "text/html" });
            window.saveAs(blob, `${fileName}.html`);
        }
        else if (format === 'word') {
             const blob = new Blob([`<html><body>${output.mainContentHTML || "No Data"}</body></html>`], { type: "application/msword" });
             window.saveAs(blob, `${fileName}.doc`);
        }
        else if (format === 'pdf') {
            if (!window.html2pdf) { alert("PDF Engine loading..."); return; }
            const element = document.createElement('div');
            element.innerHTML = output.mainContentHTML || "<h1>No Data</h1>";
            window.html2pdf().from(element).save(`${fileName}.pdf`);
        }
    };

    // --- HANDLE UPLOAD ---
    const handleUpload = async (e, type) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        setIsProcessing(true); setPhase('Reading Files...');
        const processed = [];
        
        for (let i = 0; i < files.length; i++) {
            const result = await readFileContent(files[i], (pct, msg) => {
                setProgress(pct); setPhase(msg);
            });
            processed.push(result);
        }

        const updated = { ...task };
        if (type === 'raw') updated.rawFiles = [...updated.rawFiles, ...processed];
        else updated.refFiles = [...updated.refFiles, ...processed];
        
        updateTask(updated);
        setIsProcessing(false); setProgress(0); setPhase('');
    };

    const removeFile = (type, index) => {
        if(!window.confirm("Remove this file?")) return;
        const updated = { ...task };
        if (type === 'raw') updated.rawFiles = updated.rawFiles.filter((_, i) => i !== index);
        else updated.refFiles = updated.refFiles.filter((_, i) => i !== index);
        updateTask(updated);
    };

    // --- SEND MESSAGE ---
    const handleSend = async () => {
        if (!input.trim()) return;
        const tempHistory = [...task.history, { role: 'user', text: input, timestamp: Date.now() }];
        updateTask({ ...task, history: tempHistory });
        setInput('');
        setIsProcessing(true); setPhase('Initializing Virtual CA...'); setProgress(5);

        try {
            const rawContext = task.rawFiles.map((f, i) => `[FILE_${i+1}: ${f.name}]\n${f.content.substring(0, 50000)}`).join('\n\n');
            const refContext = task.refFiles.map((f, i) => `[REF_FILE_${i+1}: ${f.name}]\n${f.content.substring(0, 20000)}`).join('\n\n');
            
            const fullPrompt = `TASK: ${input}\n\n=== ATTACHED DATA FILES ===\n${rawContext}\n\n=== REFERENCE FILES ===\n${refContext}`;

            const response = await fetch('/api/task', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: task.history.slice(-2),
                    message: fullPrompt,
                    keyIndex: currentKeyIndex,
                    userProfile: userProfile
                }),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                setProgress(prev => Math.min(prev + 0.5, 95));
            }

            const data = robustJSONParse(fullText);
            const aiMessage = { role: 'model', text: data?.replyText || "Analysis Complete", output: data, timestamp: Date.now() };
            updateTask({ ...task, history: [...tempHistory, aiMessage], lastOutput: data });
            setPhase('Done ✅'); setProgress(100);

        } catch (error) {
            console.error(error);
            setPhase('Failed ❌');
        } finally {
            setTimeout(() => { setIsProcessing(false); setProgress(0); }, 2000);
        }
    };

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [task.history]);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* HEADER */}
            <header className="bg-white border-b h-14 flex items-center shadow-sm relative z-20 px-4">
                <div className="absolute left-4 flex items-center gap-2">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded text-gray-600">⬅ Back</button>
                    <input 
                        value={task.name} 
                        onChange={(e) => updateTask({...task, name: e.target.value})} 
                        className="font-bold outline-none text-gray-700 hover:bg-gray-50 focus:bg-white border border-transparent focus:border-gray-300 rounded px-2" 
                    />
                </div>
                
                {/* CENTER TITLE */}
                <div className="mx-auto font-black text-xl tracking-widest text-blue-900 uppercase">
                    VIRTUAL CA
                </div>

                {/* HEADER ACTIONS (Top Right) */}
                <div className="absolute right-4 flex gap-2">
                    {/* Simplified Header actions since they are now in Preview */}
                    {task.lastOutput && <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-200">Analysis Ready</span>}
                </div>
            </header>

            {isProcessing && <div className="p-2 bg-blue-50 border-b"><ProgressBar progress={progress} phase={phase} /></div>}

            {/* MAIN LAYOUT: SPLIT SCREEN */}
            <div className="flex flex-grow overflow-hidden">
                
                {/* 1. LEFT SIDEBAR: FILES (Fixed Width) */}
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
                                <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e, 'raw')} />
                            </label>
                            <div className="mt-3 space-y-2">
                                {task.rawFiles.map((f, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border shadow-sm group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="text-blue-500">📄</span>
                                            <span className="truncate w-32 font-medium" title={f.name}>{f.name}</span>
                                        </div>
                                        <button onClick={() => removeFile('raw', i)} className="text-gray-300 hover:text-red-500 p-1 font-bold">✕</button>
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
                                <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e, 'ref')} />
                            </label>
                            <div className="mt-3 space-y-2">
                                {task.refFiles.map((f, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border shadow-sm group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="text-purple-500">📎</span>
                                            <span className="truncate w-32 font-medium" title={f.name}>{f.name}</span>
                                        </div>
                                        <button onClick={() => removeFile('ref', i)} className="text-gray-300 hover:text-red-500 p-1 font-bold">✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. MIDDLE: CHAT AREA (Flexible) */}
                <div className={`flex flex-col border-r bg-gray-50 transition-all duration-300 ${task.lastOutput ? 'w-1/3' : 'w-full'}`}>
                    <div className="flex-grow p-4 overflow-y-auto space-y-4">
                        {task.history.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`p-3 rounded-lg max-w-[90%] shadow-sm text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-800'}`}>
                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 bg-white border-t flex gap-2 shadow-lg">
                        <textarea 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            className="flex-grow p-3 border rounded bg-gray-50 text-sm h-12 resize-none focus:ring-2 focus:ring-blue-500 outline-none" 
                            placeholder="Type instruction..." 
                        />
                        <button onClick={handleSend} disabled={isProcessing} className="bg-blue-600 text-white px-4 rounded font-bold hover:bg-blue-700 transition-all text-sm">
                            {isProcessing ? '...' : '➤'}
                        </button>
                    </div>
                </div>

                {/* 3. RIGHT: PREVIEW PANEL (Visible only if output exists) */}
                {task.lastOutput && (
                    <div className="flex-grow flex flex-col bg-white w-1/2 animate-slideInRight">
                        <div className="bg-gray-100 border-b p-2 flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-500 uppercase px-2">Live Preview</span>
                        </div>
                        
                        {/* HTML PREVIEW */}
                        <div className="flex-grow overflow-y-auto p-6 prose max-w-none">
                            {task.lastOutput.mainContentHTML ? (
                                <div dangerouslySetInnerHTML={{__html: task.lastOutput.mainContentHTML}} />
                            ) : (
                                <div className="text-center text-gray-400 mt-10">
                                    <p>No Visual Preview Available</p>
                                    <p className="text-xs">Check Chat for text response</p>
                                </div>
                            )}
                        </div>

                        {/* DOWNLOAD ACTIONS FOOTER */}
                        <div className="p-4 bg-gray-50 border-t grid grid-cols-2 gap-2">
                             <button onClick={() => downloadOtherFormats(task.lastOutput, 'pdf')} className="bg-white border border-red-200 text-red-600 px-3 py-2 rounded text-sm font-semibold hover:bg-red-50 flex items-center justify-center gap-1 shadow-sm">
                                📄 PDF
                            </button>
                            <button onClick={() => downloadOtherFormats(task.lastOutput, 'word')} className="bg-white border border-blue-200 text-blue-600 px-3 py-2 rounded text-sm font-semibold hover:bg-blue-50 flex items-center justify-center gap-1 shadow-sm">
                                📝 Word
                            </button>
                            <button onClick={() => downloadOtherFormats(task.lastOutput, 'html')} className="bg-white border border-purple-200 text-purple-600 px-3 py-2 rounded text-sm font-semibold hover:bg-purple-50 flex items-center justify-center gap-1 shadow-sm">
                                🌐 HTML
                            </button>
                            <button onClick={() => generateUniversalExcel(task.lastOutput)} className="bg-green-600 text-white px-3 py-2 rounded text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-1 shadow-sm">
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

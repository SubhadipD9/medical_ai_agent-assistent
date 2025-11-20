import React, { useState, useRef, useEffect } from 'react';
import { Send, Shield, Activity, Pill, Clock, AlertCircle, Search, CheckCircle, ChevronRight, Settings, X, BookOpen } from 'lucide-react';

/**
 * Medical Assistant AI Agent
 * Features:
 * - Uses Gemini 1.5 Flash (via API) with Grounding
 * - Custom Markdown Rendering Engine (Tables, Headers, Lists, Bold)
 * - Structured output enforcement via System Prompt
 */

// --- Markdown Rendering Logic ---

const renderInline = (text: string) => {
  // Split by bold syntax (**text**)
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-teal-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const MarkdownRenderer = ({ content }: { content: string }) => {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 1. Headers (### or ##)
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={key++} className="text-lg font-bold text-teal-800 mt-6 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-teal-500 rounded-full inline-block"></span>
          {line.substring(4)}
        </h3>
      );
    } 
    else if (line.startsWith('## ')) {
      nodes.push(<h2 key={key++} className="text-xl font-bold text-teal-900 mt-8 mb-4 border-b border-teal-100 pb-2">{line.substring(3)}</h2>);
    }
    // 2. Tables (| col | col |)
    else if (line.startsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i].trim());
        i++;
      }
      i--; // Backtrack
      
      // Parse Table
      if (tableRows.length >= 2) {
        const headers = tableRows[0].split('|').filter(c => c.trim() !== '').map(c => c.trim());
        // Skip row 1 (separator |---|)
        const rows = tableRows.slice(2).map(r => r.split('|').filter(c => c.trim() !== '').map(c => c.trim()));

        nodes.push(
          <div key={key++} className="overflow-hidden rounded-xl border border-slate-200 my-4 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-teal-50/50">
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="px-4 py-3 text-left text-xs font-bold text-teal-700 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-3 text-sm text-slate-600 leading-relaxed">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }
    // 3. Unordered Lists (* or -)
    else if (line.startsWith('* ') || line.startsWith('- ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('* ') || lines[i].trim().startsWith('- '))) {
        listItems.push(lines[i].trim().substring(2));
        i++;
      }
      i--;
      nodes.push(
        <ul key={key++} className="space-y-2 mb-4 mt-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-slate-700 text-sm md:text-base leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 bg-teal-400 rounded-full shrink-0"></span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    // 4. Ordered Lists (1.)
    else if (/^\d+\./.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\./.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      i--;
      nodes.push(
        <ol key={key++} className="space-y-3 mb-4 mt-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3 text-slate-700 text-sm md:text-base leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="flex items-center justify-center w-6 h-6 bg-teal-100 text-teal-700 font-bold text-xs rounded-full shrink-0">
                {idx + 1}
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    }
    // 5. Paragraphs
    else if (line.length > 0) {
      nodes.push(<p key={key++} className="mb-3 text-slate-700 leading-relaxed">{renderInline(line)}</p>);
    }
  }
  return <>{nodes}</>;
};

// --- Main Component ---

const MedicalAssistant = () => {
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<null | { text: string; source?: { title: string; uri: string }[] }>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (response && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [response]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API Key in settings first.');
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setError('');
    setResponse(null);

    // Updated System Prompt to enforce Markdown Tables and strict structure
    const systemPrompt = `
      You are a Medical Assistant AI.
      
      STRICT FORMATTING RULES (MARKDOWN):
      1. Use '###' for all Section Headers.
      2. Use '**bold**' for keywords inside lists.
      3. For the 'Usage Instructions' section, you MUST create a Markdown Table.
      
      REQUIRED SECTIONS:
      1. **Direct Answer**: (Yes/No/Maybe - Brief summary)
      2. ### Conditions Treated
         * **Condition Name**: Description...
      3. ### Benefits
         * **Benefit Name**: Description...
      4. ### Usage Instructions
         | Feature | Details |
         | :--- | :--- |
         | Best Time | (e.g., Morning, Night) |
         | Food | (e.g., After meal) |
         | Warning | (e.g., Drowsiness) |
      5. ### Step-by-Step Process
         1. Step one details...
         2. Step two details...
      
      SAFETY:
      End with: "Disclaimer: I am an AI. Consult a doctor before use."
    `;

    try {
      const payload = {
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to fetch response');
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "I couldn't find specific information. Please consult a doctor.";
      
      const sources = candidate?.groundingMetadata?.groundingAttributions?.map((a: any) => ({
        uri: a.web?.uri,
        title: a.web?.title
      })).filter((s: any) => s.uri && s.title) || [];

      setResponse({ text, source: sources });
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please check your API key and internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-teal-700 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-full">
              <Activity size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wide">MediAssist AI</h1>
              <p className="text-xs text-teal-100 opacity-80">Powered by Gemini & Google Search</p>
            </div>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-teal-600 rounded-full transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Settings Modal */}
        {showSettings && (
          <div className="mb-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Settings size={18} /> Configuration
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Google AI Studio API Key"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Required to access the medical model. Your key is used locally and never stored.
                </p>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-teal-800 transition-colors text-sm font-medium"
              >
                Save & Close
              </button>
            </div>
          </div>
        )}

        {/* Main Search Area */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-800 mb-3">Your Intelligent Medical Companion</h2>
          <p className="text-slate-600 mb-8 max-w-xl mx-auto">
            Ask about medicines, symptoms, or treatments. Our AI researches real-time medical data to give you structured, safe advice.
          </p>
          
          <div className="relative max-w-2xl mx-auto">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={20} />
            </div>
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g., Is Ginger Tea good for nausea? How to make it?"
              className="w-full pl-12 pr-24 py-4 rounded-2xl border border-slate-200 shadow-lg focus:shadow-xl focus:border-teal-500 outline-none text-lg transition-all"
            />
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="absolute right-2 top-2 bottom-2 bg-teal-600 text-white px-6 rounded-xl hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
            >
              {loading ? 'Searching...' : 'Ask'}
              {!loading && <Send size={16} />}
            </button>
          </div>

          {/* Quick Prompts */}
          {!response && !loading && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {["How to take Amoxicillin?", "Benefits of Ginger tea", "Side effects of Ibuprofen", "Cure for common cold"].map((item, i) => (
                <button 
                  key={i}
                  onClick={() => setQuery(item)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-teal-500 hover:text-teal-700 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Results Section */}
        {loading && (
          <div className="max-w-3xl mx-auto p-8 text-center">
            <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 animate-pulse">Analyzing medical databases & searching sources...</p>
          </div>
        )}

        {response && (
          <div ref={resultRef} className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* Main Report Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="bg-teal-50 border-b border-teal-100 p-4 flex items-center gap-3">
                <div className="bg-teal-100 p-2 rounded-lg">
                  <Pill className="text-teal-700" size={20} />
                </div>
                <h3 className="font-bold text-teal-900 text-lg">Analysis Report</h3>
              </div>
              
              <div className="p-6 md:p-8">
                {/* Render Response with Custom Markdown Engine */}
                <div className="prose prose-slate max-w-none">
                  <MarkdownRenderer content={response.text} />
                </div>

                {/* Sources */}
                {response.source && response.source.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BookOpen size={14} /> Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {response.source.map((s, i) => (
                        <a 
                          key={i} 
                          href={s.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-md hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors flex items-center gap-1 truncate max-w-xs"
                        >
                          {s.title || 'Web Source'} <ChevronRight size={10} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Disclaimer Footer */}
              <div className="bg-amber-50 border-t border-amber-100 p-4 flex items-start gap-3 text-amber-800 text-sm">
                <Shield size={18} className="shrink-0 mt-0.5" />
                <p>
                  <strong>Disclaimer:</strong> This report is generated by AI using internet sources. It is for informational purposes only and does not substitute professional medical advice. Always consult a healthcare provider.
                </p>
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-start gap-3 hover:shadow-md transition-shadow">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600 shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">Set a Reminder?</h4>
                  <p className="text-sm text-slate-500 mt-1">Don't forget to take your medicine on time.</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-start gap-3 hover:shadow-md transition-shadow">
                <div className="bg-green-100 p-2 rounded-full text-green-600 shrink-0">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">Track Symptoms</h4>
                  <p className="text-sm text-slate-500 mt-1">Keep a log of how you are feeling.</p>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
};

export default MedicalAssistant;
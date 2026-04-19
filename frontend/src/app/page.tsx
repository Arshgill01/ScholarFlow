"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { UploadCloud, FileText, Server, Activity, ArrowRight, Loader2, Database, Link as LinkIcon, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Document {
  id: number;
  filename: string;
  upload_date: string;
}

interface RetrievedChunk {
  text: string;
  source: string;
}

interface Report {
  query: string;
  content: string;
  timestamp: Date;
}

export default function Dashboard() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [activeChunks, setActiveChunks] = useState<RetrievedChunk[]>([]);
  const [dbStatus, setDbStatus] = useState<"connected" | "error">("connected");

  const reportEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (reportEndRef.current) {
      reportEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [reports]);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get("http://localhost:8000/documents/");
      setDocuments(res.data);
      setDbStatus("connected");
    } catch (err) {
      console.error(err);
      setDbStatus("error");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post("http://localhost:8000/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchDocuments();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to process document: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || synthesizing) return;

    setSynthesizing(true);
    const currentQuery = query.trim();
    setQuery("");

    try {
      const res = await axios.post("http://localhost:8000/chat/", { query: currentQuery });
      
      setReports(prev => [...prev, {
        query: currentQuery,
        content: res.data.answer,
        timestamp: new Date()
      }]);
      
      setActiveChunks(res.data.chunks || []);
    } catch (err) {
      console.error(err);
      setReports(prev => [...prev, {
        query: currentQuery,
        content: "### Error\nFailed to synthesize research. Backend connection refused or timeout.",
        timestamp: new Date()
      }]);
    } finally {
      setSynthesizing(false);
    }
  };

  const formatMarkdown = (text: string) => {
    const lines = text.split('\\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) {
        return <h3 key={i}>{line.substring(4)}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i}>{line.substring(3)}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={i}>{line.substring(2)}</h1>;
      }
      if (line.startsWith('* ') || line.startsWith('- ')) {
        // Parse bold inside list
        const content = line.substring(2);
        return <li key={i}>{parseBold(content)}</li>;
      }
      if (line.trim() === '') {
        return <br key={i} />;
      }
      return <p key={i}>{parseBold(line)}</p>;
    });
  };

  const parseBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.substring(2, part.length - 2)}</strong>;
      }
      return part;
    });
  };

  return (
    <main className="flex h-screen w-full overflow-hidden bg-[#0C0C0C] text-[#A3A3A3] font-sans selection:bg-[#3B82F6] selection:text-white">
      
      {/* LEFT PANE: SYSTEM & DATA SOURCE */}
      <section className="w-[300px] flex-shrink-0 border-r border-[#262626] bg-[#111111] flex flex-col z-20 shadow-2xl">
        <div className="p-5 border-b border-[#262626] bg-[#0A0A0A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#171717] border border-[#262626] rounded-sm flex items-center justify-center">
              <Server className="w-4 h-4 text-[#EDEDED]" />
            </div>
            <div>
              <h1 className="text-sm font-mono font-bold text-[#EDEDED] tracking-wide">ScholarFlow_</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${dbStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-wider font-mono text-[#737373]">
                  {dbStatus === 'connected' ? 'PGVector Linked' : 'DB Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-widest font-mono text-[#737373] font-semibold">Indexed Sources</h2>
            <span className="text-xs font-mono bg-[#262626] text-[#D4D4D4] px-1.5 py-0.5 rounded-sm">{documents.length}</span>
          </div>

          <label className="mb-4 relative flex flex-col items-center justify-center w-full border border-dashed border-[#404040] rounded-sm bg-[#171717] hover:bg-[#262626] hover:border-[#525252] transition-colors cursor-pointer group py-6">
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={uploading} />
            {uploading ? (
              <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin mb-2" />
            ) : (
              <UploadCloud className="w-5 h-5 text-[#737373] group-hover:text-[#EDEDED] transition-colors mb-2" />
            )}
            <span className="text-xs font-mono text-[#A3A3A3]">
              {uploading ? 'Processing...' : 'Upload PDF Document'}
            </span>
          </label>

          <div className="flex-1 overflow-y-auto pr-1">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center border border-[#262626] border-dashed rounded-sm bg-[#0A0A0A]">
                <Database className="w-5 h-5 text-[#404040] mb-2" />
                <span className="text-[11px] font-mono text-[#737373]">Knowledge base empty.</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-start p-2.5 bg-[#0A0A0A] border border-[#262626] rounded-sm hover:border-[#404040] transition-colors">
                    <FileText className="w-3.5 h-3.5 text-[#737373] mr-2.5 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#D4D4D4] truncate font-medium">{doc.filename}</p>
                      <p className="text-[10px] text-[#525252] font-mono mt-1">ID: {doc.id} • {new Date(doc.upload_date).toISOString().split('T')[0]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* MIDDLE PANE: SYNTHESIS ENGINE (Terminal Interface) */}
      <section className="flex-1 flex flex-col border-r border-[#262626] bg-[#0A0A0A] relative">
        {/* Terminal Header */}
        <div className="h-[57px] flex items-center px-6 border-b border-[#262626] bg-[#0A0A0A] flex-shrink-0">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#EDEDED] flex items-center">
            <Activity className="w-3.5 h-3.5 mr-2 text-[#3B82F6]" />
            Synthesis Engine v2.0
          </h2>
        </div>

        {/* Reports Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-12">
          {reports.length === 0 && !synthesizing ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-12 h-12 border border-[#262626] rounded-full flex items-center justify-center mb-6 bg-[#111111]">
                <Database className="w-5 h-5 text-[#525252]" />
              </div>
              <h3 className="text-[#EDEDED] font-serif text-2xl mb-3">Initiate Research Query</h3>
              <p className="text-sm text-[#737373] leading-relaxed">
                Enter a highly specific research question below. The system will retrieve relevant vectors, synthesize the context, and output a structured academic report.
              </p>
            </div>
          ) : (
            <>
              {reports.map((report, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#111111] border border-[#262626] rounded-sm p-8 shadow-lg"
                >
                  <div className="flex items-start gap-4 mb-8 pb-6 border-b border-[#262626]">
                    <span className="text-[#3B82F6] font-mono text-sm mt-0.5">&gt;</span>
                    <h2 className="font-serif text-2xl text-[#FFFFFF] leading-snug">{report.query}</h2>
                  </div>
                  
                  <div className="prose prose-invert max-w-none prose-p:text-[#A3A3A3] prose-headings:text-[#EDEDED]">
                    {formatMarkdown(report.content)}
                  </div>
                </motion.div>
              ))}
              
              {synthesizing && (
                <div className="bg-[#111111] border border-[#262626] rounded-sm p-8 flex items-center gap-4 animate-pulse">
                  <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin" />
                  <span className="font-mono text-sm text-[#737373] uppercase tracking-wider">Compiling Context & Synthesizing...</span>
                </div>
              )}
              <div ref={reportEndRef} />
            </>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-6 border-t border-[#262626] bg-[#111111]">
          <form onSubmit={handleSynthesize} className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#525252] font-mono">&gt;</div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={synthesizing}
              placeholder="e.g. Synthesize the findings on SOLID principles and architectural chaos..."
              className="w-full bg-[#0A0A0A] border border-[#262626] text-[#EDEDED] font-mono text-sm pl-8 pr-12 py-4 rounded-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all placeholder-[#404040]"
            />
            <button
              type="submit"
              disabled={synthesizing || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#262626] hover:bg-[#3B82F6] text-[#EDEDED] p-2 rounded-sm transition-colors disabled:opacity-50 disabled:hover:bg-[#262626]"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      {/* RIGHT PANE: DATA INSPECTOR */}
      <section className="w-[380px] flex-shrink-0 bg-[#0C0C0C] flex flex-col z-10 shadow-2xl">
        <div className="h-[57px] flex items-center px-5 border-b border-[#262626] bg-[#111111] flex-shrink-0">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#737373] flex items-center">
            <Database className="w-3.5 h-3.5 mr-2" />
            Vector Retrieval Inspector
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 bg-[#0C0C0C]">
          {activeChunks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs font-mono text-[#404040]">Awaiting Synthesis Task...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-6">
                <AlertCircle className="w-4 h-4 text-[#3B82F6]" />
                <span className="text-xs font-mono text-[#D4D4D4]">Raw context injected into LLM</span>
              </div>
              
              <AnimatePresence>
                {activeChunks.map((chunk, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="border border-[#262626] bg-[#111111] rounded-sm overflow-hidden"
                  >
                    <div className="bg-[#171717] border-b border-[#262626] px-3 py-2 flex items-center gap-2">
                      <LinkIcon className="w-3 h-3 text-[#737373]" />
                      <span className="text-[10px] font-mono text-[#A3A3A3] uppercase tracking-wider truncate">
                        {chunk.source}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="text-[12px] text-[#737373] font-mono leading-relaxed break-words whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

    </main>
  );
}
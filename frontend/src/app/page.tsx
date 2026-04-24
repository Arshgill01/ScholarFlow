"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import axios from "axios";
import {
  UploadCloud,
  FileText,
  Server,
  Activity,
  ArrowRight,
  Loader2,
  Database,
  Link as LinkIcon,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { apiUrl } from "../lib/api";
import {
  type ChatResponse,
  type ChatSection,
  type RetrievedChunk,
  createFallbackChatResponse,
  normalizeChatResponse,
} from "../lib/chat";

interface Document {
  id: number;
  filename: string;
  upload_date: string;
}

interface Report {
  query: string;
  response: ChatResponse;
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

  async function fetchHealth() {
    try {
      await axios.get(apiUrl("/health"));
      setDbStatus("connected");
    } catch (err) {
      console.error(err);
      setDbStatus("error");
    }
  }

  async function fetchDocuments() {
    try {
      const res = await axios.get(apiUrl("/documents/"));
      setDocuments(res.data);
      setDbStatus("connected");
    } catch (err) {
      console.error(err);
      setDbStatus("error");
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchHealth();
      void fetchDocuments();
    });
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchHealth();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (reportEndRef.current) {
      reportEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [reports]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post(apiUrl("/documents/upload"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchHealth();
      await fetchDocuments();
    } catch (err: unknown) {
      console.error(err);
      alert(
        `Failed to process document: ${getErrorDetail(err) ?? "Upload failed"}`
      );
      setDbStatus("error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || synthesizing) return;

    setSynthesizing(true);
    const currentQuery = query.trim();
    setQuery("");

    try {
      const res = await axios.post(apiUrl("/chat/"), { query: currentQuery });
      const response = normalizeChatResponse(res.data);

      setReports((prev) => [
        ...prev,
        {
          query: currentQuery,
          response,
          timestamp: new Date(),
        },
      ]);

      setActiveChunks(response.chunks ?? []);
      setDbStatus("connected");
    } catch (err: unknown) {
      console.error(err);
      const fallbackResponse = getErrorChatResponse(err);
      setReports((prev) => [
        ...prev,
        {
          query: currentQuery,
          response: fallbackResponse,
          timestamp: new Date(),
        },
      ]);
      setActiveChunks(fallbackResponse.chunks);
      setDbStatus("error");
    } finally {
      setSynthesizing(false);
    }
  };

  const renderSection = (section: ChatSection, status: ChatResponse["status"]) => {
    const bodyClassName =
      status === "error"
        ? "text-[#FCA5A5]"
        : status === "insufficient_data"
          ? "text-[#D4D4D4]"
          : "text-[#CFCFCF]";

    return (
      <section key={section.key} className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-[0.22em] font-mono text-[#737373]">
          {section.title}
        </h3>
        {section.body ? (
          <p className={`text-[15px] leading-7 ${bodyClassName}`}>
            {section.body}
          </p>
        ) : null}
        {section.items.length > 0 ? (
          <ul className="space-y-2">
            {section.items.map((item) => (
              <li
                key={`${section.key}-${item}`}
                className="border-l border-[#262626] pl-3 text-[13px] leading-6 text-[#A3A3A3]"
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  };

  return (
    <main suppressHydrationWarning className="flex h-screen w-full overflow-hidden bg-[#0C0C0C] text-[#A3A3A3] font-sans selection:bg-[#3B82F6] selection:text-white">
      <section className="w-[300px] flex-shrink-0 border-r border-[#262626] bg-[#111111] flex flex-col z-20 shadow-2xl">
        <div className="p-5 border-b border-[#262626] bg-[#0A0A0A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#171717] border border-[#262626] rounded-sm flex items-center justify-center">
              <Server className="w-4 h-4 text-[#EDEDED]" />
            </div>
            <div>
              <h1 className="text-sm font-mono font-bold text-[#EDEDED] tracking-wide">
                ScholarFlow_
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    dbStatus === "connected"
                      ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                      : "bg-red-500"
                  }`}
                />
                <span className="text-[10px] uppercase tracking-wider font-mono text-[#737373]">
                  {dbStatus === "connected" ? "Spring Frontdoor Linked" : "API Unreachable"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-widest font-mono text-[#737373] font-semibold">
              Indexed Sources
            </h2>
            <span className="text-xs font-mono bg-[#262626] text-[#D4D4D4] px-1.5 py-0.5 rounded-sm">
              {documents.length}
            </span>
          </div>

          <label className="mb-4 relative flex flex-col items-center justify-center w-full border border-dashed border-[#404040] rounded-sm bg-[#171717] hover:bg-[#262626] hover:border-[#525252] transition-colors cursor-pointer group py-6">
            <input
              type="file"
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            {uploading ? (
              <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin mb-2" />
            ) : (
              <UploadCloud className="w-5 h-5 text-[#737373] group-hover:text-[#EDEDED] transition-colors mb-2" />
            )}
            <span className="text-xs font-mono text-[#A3A3A3]">
              {uploading ? "Processing..." : "Upload PDF Document"}
            </span>
          </label>

          <div className="flex-1 overflow-y-auto pr-1">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center border border-[#262626] border-dashed rounded-sm bg-[#0A0A0A]">
                <Database className="w-5 h-5 text-[#404040] mb-2" />
                <span className="text-[11px] font-mono text-[#737373]">
                  Knowledge base empty.
                </span>
              </div>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-start p-2.5 bg-[#0A0A0A] border border-[#262626] rounded-sm hover:border-[#404040] transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#737373] mr-2.5 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#D4D4D4] truncate font-medium">
                        {doc.filename}
                      </p>
                      <p className="text-[10px] text-[#525252] font-mono mt-1">
                        ID: {doc.id} •{" "}
                        {new Date(doc.upload_date).toISOString().split("T")[0]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="flex-1 flex flex-col border-r border-[#262626] bg-[#0A0A0A] relative">
        <div className="h-[57px] flex items-center px-6 border-b border-[#262626] bg-[#0A0A0A] flex-shrink-0">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#EDEDED] flex items-center">
            <Activity className="w-3.5 h-3.5 mr-2 text-[#3B82F6]" />
            Synthesis Engine v2.0
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-12">
          {reports.length === 0 && !synthesizing ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-12 h-12 border border-[#262626] rounded-full flex items-center justify-center mb-6 bg-[#111111]">
                <Database className="w-5 h-5 text-[#525252]" />
              </div>
              <h3 className="text-[#EDEDED] font-serif text-2xl mb-3">
                Initiate Research Query
              </h3>
              <p className="text-sm text-[#737373] leading-relaxed">
                Enter a highly specific research question below. The system will
                retrieve vectors through Spring, synthesize the context, and
                return structured sections for the report.
              </p>
            </div>
          ) : (
            <>
              {reports.map((report, idx) => (
                <motion.div
                  key={`${report.query}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#111111] border border-[#262626] rounded-sm p-8 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4 mb-8 pb-6 border-b border-[#262626]">
                    <div className="flex items-start gap-4">
                      <span className="text-[#3B82F6] font-mono text-sm mt-0.5">
                        &gt;
                      </span>
                      <h2 className="font-serif text-2xl text-[#FFFFFF] leading-snug">
                        {report.query}
                      </h2>
                    </div>
                    <span
                      className={`px-2 py-1 text-[10px] font-mono uppercase tracking-[0.22em] border rounded-sm ${
                        report.response.status === "ok"
                          ? "border-[#264653] text-[#8EC5A6]"
                          : report.response.status === "insufficient_data"
                            ? "border-[#525252] text-[#D4D4D4]"
                            : "border-[#7F1D1D] text-[#FCA5A5]"
                      }`}
                    >
                      {report.response.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="space-y-8">
                    {report.response.sections.length > 0
                      ? report.response.sections.map((section) =>
                          renderSection(section, report.response.status)
                        )
                      : renderAnswerFallback(report.response.answer)}
                  </div>
                </motion.div>
              ))}

              {synthesizing ? (
                <div className="bg-[#111111] border border-[#262626] rounded-sm p-8 flex items-center gap-4 animate-pulse">
                  <Loader2 className="w-5 h-5 text-[#3B82F6] animate-spin" />
                  <span className="font-mono text-sm text-[#737373] uppercase tracking-wider">
                    Compiling Context & Synthesizing...
                  </span>
                </div>
              ) : null}
              <div ref={reportEndRef} />
            </>
          )}
        </div>

        <div className="p-6 border-t border-[#262626] bg-[#111111]">
          <form onSubmit={handleSynthesize} className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#525252] font-mono">
              &gt;
            </div>
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
              <span className="text-xs font-mono text-[#404040]">
                Awaiting Synthesis Task...
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-6">
                <AlertCircle className="w-4 h-4 text-[#3B82F6]" />
                <span className="text-xs font-mono text-[#D4D4D4]">
                  Evidence excerpts forwarded to the model
                </span>
              </div>

              <AnimatePresence>
                {activeChunks.map((chunk, idx) => (
                  <motion.div
                    key={`${chunk.source}-${idx}`}
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

function renderAnswerFallback(answer: string) {
  return answer.split("\n").map((line, index) => {
    if (!line.trim()) {
      return <div key={`spacer-${index}`} className="h-2" />;
    }

    return (
      <p key={`line-${index}`} className="text-[15px] leading-7 text-[#CFCFCF]">
        {line}
      </p>
    );
  });
}

function getErrorChatResponse(error: unknown): ChatResponse {
  if (axios.isAxiosError(error)) {
    if (error.response?.data) {
      const response = normalizeChatResponse(error.response.data);
      if (response.status === "ok") {
        return {
          ...response,
          status: "error",
        };
      }
      return response;
    }

    return createFallbackChatResponse(
      "Failed to synthesize research. Spring or the Python bridge is unavailable.",
      "error"
    );
  }

  return createFallbackChatResponse(
    "Failed to synthesize research. An unexpected error occurred.",
    "error"
  );
}

function getErrorDetail(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : error.message;
}

"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BookOpen, Loader2, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { apiUrl } from "../lib/api";
import {
  type ChatResponse,
  createFallbackChatResponse,
  normalizeChatResponse,
} from "../lib/chat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Welcome to ScholarFlow. I am ready to answer questions based on the documents in your knowledge base. How may I assist your research today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(apiUrl("/chat/"), { query: userMessage.content });
      const response = normalizeChatResponse(res.data);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.answer,
          response,
        },
      ]);
    } catch (err) {
      console.error(err);
      const response = getErrorChatResponse(err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.answer,
          response,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex-none p-6 md:px-10 md:py-8 border-b border-[#E8E6DF] bg-white z-10">
        <h1 className="font-serif text-3xl text-[#1A1A1A] tracking-tight">
          Research Interface
        </h1>
        <p className="text-sm text-[#75736C] mt-1 font-medium tracking-wide">
          QUERY YOUR SCHOLARLY ARCHIVE
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-4xl ${msg.role === "user" ? "ml-auto" : ""}`}
            >
              {msg.role === "user" ? (
                <div className="bg-[#1A1A1A] text-[#FAF9F5] px-6 py-4 rounded-sm shadow-sm inline-block max-w-2xl font-serif text-lg">
                  {msg.content}
                </div>
              ) : (
                <div className="text-[#333333] pr-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-6 h-6 bg-[#8B2323] text-white rounded-sm flex items-center justify-center mr-3 shadow-sm">
                        <span className="font-serif font-bold text-xs">S</span>
                      </div>
                      <span className="text-xs tracking-[0.22em] font-bold text-[#8B2323]">
                        ScholarFlow
                      </span>
                    </div>
                    {msg.response ? (
                      <span
                        className={`px-2 py-1 text-[10px] border rounded-sm tracking-[0.22em] ${
                          msg.response.status === "ok"
                            ? "border-[#D6D3D1] text-[#57534E]"
                            : msg.response.status === "insufficient_data"
                              ? "border-[#D6D3D1] text-[#78716C]"
                              : "border-[#F5C2C2] text-[#8B2323]"
                        }`}
                      >
                        {msg.response.status.replace("_", " ")}
                      </span>
                    ) : null}
                  </div>

                  {msg.response?.sections?.length ? (
                    <div className="space-y-6">
                      {msg.response.sections.map((section) => (
                        <section key={`${msg.id}-${section.key}`} className="space-y-2">
                          <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#8C8A82]">
                            {section.title}
                          </h2>
                          {section.body ? (
                            <p
                              className={`text-[15px] leading-7 ${
                                msg.response?.status === "error"
                                  ? "text-[#8B2323]"
                                  : "text-[#2C2B29]"
                              }`}
                            >
                              {section.body}
                            </p>
                          ) : null}
                          {section.items.length ? (
                            <ul className="space-y-2">
                              {section.items.map((item) => (
                                <li
                                  key={`${msg.id}-${section.key}-${item}`}
                                  className="border-l border-[#E8E6DF] pl-3 text-[14px] leading-6 text-[#57534E]"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {msg.content.split("\n").map((part, i) =>
                        part.trim() ? (
                          <p key={`${msg.id}-${i}`} className="text-[15px] leading-7 text-[#2C2B29]">
                            {part}
                          </p>
                        ) : (
                          <div key={`${msg.id}-${i}`} className="h-2" />
                        )
                      )}
                    </div>
                  )}

                  {msg.response?.sources?.length ? (
                    <div className="mt-5 pt-4 border-t border-[#E8E6DF]">
                      <div className="flex items-center text-[#8C8A82] mb-2">
                        <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                        <span className="text-xs uppercase tracking-wider font-semibold">
                          Citations
                        </span>
                      </div>
                      <ul className="flex flex-wrap gap-2">
                        {msg.response.sources.map((source) => (
                          <li
                            key={`${msg.id}-${source}`}
                            className="text-xs bg-[#F2F1EC] text-[#5C5A54] px-2.5 py-1 rounded-sm border border-[#E8E6DF]"
                          >
                            {source}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {msg.response?.chunks?.length ? (
                    <div className="mt-5 pt-4 border-t border-[#E8E6DF] space-y-3">
                      <span className="text-xs uppercase tracking-wider font-semibold text-[#8C8A82]">
                        Evidence
                      </span>
                      {msg.response.chunks.map((chunk, index) => (
                        <div
                          key={`${msg.id}-${chunk.source}-${index}`}
                          className="border border-[#E8E6DF] rounded-sm bg-[#FAF9F5] px-4 py-3"
                        >
                          <p className="text-[11px] tracking-[0.18em] uppercase text-[#A8A29E] mb-2">
                            {chunk.source}
                          </p>
                          <p className="text-[13px] leading-6 text-[#44403C]">
                            {chunk.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          ))}
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center text-[#8C8A82] max-w-3xl"
            >
              <div className="w-6 h-6 bg-[#E8E6DF] rounded-sm flex items-center justify-center mr-3">
                <Loader2 className="w-3 h-3 animate-spin text-[#5C5A54]" />
              </div>
              <span className="text-sm italic font-serif">Synthesizing response...</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex-none p-6 md:px-10 md:pb-10 bg-gradient-to-t from-white via-white to-transparent pt-4">
        <form onSubmit={handleSubmit} className="max-w-4xl relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pose a question to your archive..."
            className="w-full bg-[#FAF9F5] border border-[#D5D3CB] text-[#1A1A1A] placeholder-[#A6A49D] pl-6 pr-14 py-4 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#8B2323] focus:border-[#8B2323] transition-all font-serif text-lg shadow-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#8C8A82] hover:text-[#8B2323] disabled:opacity-50 disabled:hover:text-[#8C8A82] transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-center text-[#A6A49D] text-[11px] mt-3 tracking-wide">
          Responses are served through Spring on port 8080 and sourced from the
          Python RAG backend.
        </p>
      </div>
    </div>
  );
}

function getErrorChatResponse(error: unknown): ChatResponse {
  if (axios.isAxiosError(error) && error.response?.data) {
    const response = normalizeChatResponse(error.response.data);
    return response.status === "ok" ? { ...response, status: "error" } : response;
  }

  return createFallbackChatResponse(
    "I encountered an error retrieving the information. Please ensure the Spring frontdoor and Python backend are running.",
    "error"
  );
}

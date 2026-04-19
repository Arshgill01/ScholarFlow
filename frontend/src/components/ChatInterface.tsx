"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Send, Loader2, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Welcome to ScholarFlow. I am ready to answer questions based on the documents in your knowledge base. How may I assist your research today?",
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
      const res = await axios.post("http://localhost:8000/chat/", { query: userMessage.content });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.data.answer,
        sources: res.data.sources,
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "I encountered an error retrieving the information. Please ensure the backend is running and connected." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Simple Markdown-like formatter for bold text and lists
  const formatText = (text: string) => {
    const parts = text.split('\n');
    return parts.map((part, i) => {
      if (part.trim() === "") {
        return <br key={i} />;
      }
      
      if (part.startsWith('* ') || part.startsWith('- ')) {
        return <li key={i} className="ml-4 list-disc marker:text-[#8B2323]">{part.substring(2)}</li>;
      }
      
      // Handle bold
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parsedPart = [];
      let lastIndex = 0;
      let match;
      while ((match = boldRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          parsedPart.push(<span key={`${i}-text-${lastIndex}`}>{part.substring(lastIndex, match.index)}</span>);
        }
        parsedPart.push(<strong key={`${i}-bold-${match.index}`} className="font-semibold text-[#1A1A1A]">{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < part.length) {
        parsedPart.push(<span key={`${i}-text-end`}>{part.substring(lastIndex)}</span>);
      }

      return <p key={i} className="mb-3 leading-relaxed">{parsedPart.length > 0 ? parsedPart : part}</p>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="flex-none p-6 md:px-10 md:py-8 border-b border-[#E8E6DF] bg-white z-10">
        <h1 className="font-serif text-3xl text-[#1A1A1A] tracking-tight">Research Interface</h1>
        <p className="text-sm text-[#75736C] mt-1 font-medium tracking-wide">QUERY YOUR SCHOLARLY ARCHIVE</p>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8"
      >
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
                  <div className="flex items-center mb-4">
                    <div className="w-6 h-6 bg-[#8B2323] text-white rounded-sm flex items-center justify-center mr-3 shadow-sm">
                      <span className="font-serif font-bold text-xs">S</span>
                    </div>
                    <span className="text-xs uppercase tracking-widest font-bold text-[#8B2323]">ScholarFlow</span>
                  </div>
                  <div className="prose text-[15px] max-w-none text-[#2C2B29]">
                    {formatText(msg.content)}
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-[#E8E6DF]">
                      <div className="flex items-center text-[#8C8A82] mb-2">
                        <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                        <span className="text-xs uppercase tracking-wider font-semibold">Citations</span>
                      </div>
                      <ul className="flex flex-wrap gap-2">
                        {msg.sources.map((source, idx) => (
                          <li key={idx} className="text-xs bg-[#F2F1EC] text-[#5C5A54] px-2.5 py-1 rounded-sm border border-[#E8E6DF]">
                            {source}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
          {loading && (
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
          )}
        </AnimatePresence>
      </div>

      {/* Input Form */}
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
          Responses are generated using RAG and Google Gemma. Verify critical citations manually.
        </p>
      </div>
    </div>
  );
}
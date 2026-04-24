"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { FileText, UploadCloud, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { apiUrl } from "../lib/api";

interface Document {
  id: number;
  filename: string;
  upload_date: string;
}

export default function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(apiUrl("/documents/"));
      setDocuments(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load documents");
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDocuments();
    });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf")) {
      setError("Only PDF files are supported");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post(apiUrl("/documents/upload"), formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchDocuments();
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        setError(err.response.data.detail);
      } else {
        setError("Upload failed");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F5] border-r border-[#E8E6DF] p-6 md:p-8 relative">
      <h2 className="font-serif text-2xl mb-6 text-[#2C2B29] tracking-tight">Knowledge Base</h2>
      
      {/* Upload Zone */}
      <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#D5D3CB] rounded-sm hover:bg-[#F2F1EC] transition-colors cursor-pointer mb-6 group">
        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={uploading} />
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          {uploading ? (
            <Loader2 className="w-6 h-6 text-[#8B2323] animate-spin mb-2" />
          ) : (
            <UploadCloud className="w-6 h-6 text-[#75736C] mb-2 group-hover:text-[#8B2323] transition-colors" />
          )}
          <p className="text-sm text-[#5C5A54] font-medium">
            {uploading ? "Processing PDF..." : "Upload a new document"}
          </p>
          <p className="text-xs text-[#8C8A82] mt-1">PDF up to 20MB</p>
        </div>
      </label>

      {error && <p className="text-sm text-[#8B2323] mb-4 bg-[#FDE9E9] p-3 rounded-sm border border-[#F5C2C2]">{error}</p>}

      {/* Document List */}
      <div className="flex-1 overflow-y-auto pr-2">
        <h3 className="text-xs uppercase tracking-widest text-[#8C8A82] mb-4 font-semibold">Indexed Sources ({documents.length})</h3>
        <ul className="space-y-3">
          <AnimatePresence>
            {documents.map((doc) => (
              <motion.li
                key={doc.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center p-3 bg-white border border-[#E8E6DF] rounded-sm shadow-sm hover:shadow-md transition-shadow group"
              >
                <FileText className="w-4 h-4 text-[#8B2323] mr-3 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2C2B29] truncate">{doc.filename}</p>
                  <p className="text-xs text-[#8C8A82] mt-0.5">
                    {new Date(doc.upload_date).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <button className="opacity-0 group-hover:opacity-100 p-2 text-[#A6A49D] hover:text-[#8B2323] transition-colors" title="Remove Document (Not Implemented)">
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

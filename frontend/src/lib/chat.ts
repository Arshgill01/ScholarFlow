export type ChatStatus = "ok" | "insufficient_data" | "error";

export interface RetrievedChunk {
  text: string;
  source: string;
}

export interface ChatSection {
  key: "synthesis" | "key_data_points" | "sources";
  title: string;
  body: string | null;
  items: string[];
}

export interface ChatResponse {
  status: ChatStatus;
  answer: string;
  sources: string[];
  chunks: RetrievedChunk[];
  sections: ChatSection[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRetrievedChunk(value: unknown): value is RetrievedChunk {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as RetrievedChunk).text === "string" &&
      typeof (value as RetrievedChunk).source === "string"
  );
}

function isChatSection(value: unknown): value is ChatSection {
  return Boolean(
    value &&
      typeof value === "object" &&
      ["synthesis", "key_data_points", "sources"].includes((value as ChatSection).key) &&
      typeof (value as ChatSection).title === "string" &&
      ((value as ChatSection).body === null || typeof (value as ChatSection).body === "string") &&
      isStringArray((value as ChatSection).items)
  );
}

export function isChatResponse(value: unknown): value is ChatResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      ["ok", "insufficient_data", "error"].includes((value as ChatResponse).status) &&
      typeof (value as ChatResponse).answer === "string" &&
      isStringArray((value as ChatResponse).sources) &&
      Array.isArray((value as ChatResponse).chunks) &&
      (value as ChatResponse).chunks.every(isRetrievedChunk) &&
      Array.isArray((value as ChatResponse).sections) &&
      (value as ChatResponse).sections.every(isChatSection)
  );
}

export function buildFallbackSections(answer: string, sources: string[]): ChatSection[] {
  return [
    {
      key: "synthesis",
      title: "Synthesis",
      body: answer,
      items: [],
    },
    {
      key: "key_data_points",
      title: "Key Data Points",
      body: null,
      items: [],
    },
    {
      key: "sources",
      title: "Sources",
      body: null,
      items: sources,
    },
  ];
}

export function normalizeChatResponse(value: unknown): ChatResponse {
  if (isChatResponse(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { answer?: unknown }).answer === "string"
  ) {
    const answer = (value as { answer: string }).answer;
    const sources = isStringArray((value as { sources?: unknown }).sources)
      ? (value as { sources: string[] }).sources
      : [];
    const chunks = Array.isArray((value as { chunks?: unknown[] }).chunks)
      ? (value as { chunks: unknown[] }).chunks.filter(isRetrievedChunk)
      : [];

    return {
      status: "ok",
      answer,
      sources,
      chunks,
      sections: buildFallbackSections(answer, sources),
    };
  }

  return createFallbackChatResponse(
    "The backend returned an unexpected response.",
    "error"
  );
}

export function createFallbackChatResponse(
  message: string,
  status: ChatStatus
): ChatResponse {
  return {
    status,
    answer: `### Synthesis\n${message}\n\n### Key Data Points\n\n### Sources`,
    sources: [],
    chunks: [],
    sections: [
      {
        key: "synthesis",
        title: "Synthesis",
        body: message,
        items: [],
      },
      {
        key: "key_data_points",
        title: "Key Data Points",
        body: null,
        items: [],
      },
      {
        key: "sources",
        title: "Sources",
        body: null,
        items: [],
      },
    ],
  };
}

export function getSection(
  response: ChatResponse,
  key: ChatSection["key"]
): ChatSection | undefined {
  return response.sections.find((section) => section.key === key);
}

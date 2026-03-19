"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import type { RepoAnalysis } from "@/types/analysis";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  sessionId?: string;
  repos: RepoAnalysis[];
}

export function Chat({ sessionId, repos }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMessages = messages.length > 0 || !!streamingContent || isStreaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const body = sessionId
        ? { sessionId, message: text }
        : { repos: repos.map((r) => ({ name: r.name, analysis: r })), message: text };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Failed to get response. Please try again." },
        ]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case "chat_token":
                accumulated += event.content;
                setStreamingContent(accumulated);
                break;
              case "chat_done":
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: event.content },
                ]);
                setStreamingContent("");
                break;
              case "chat_error":
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Error: ${event.message}` },
                ]);
                setStreamingContent("");
                break;
            }
          } catch {
            // skip malformed
          }
        }
      }

      if (accumulated && !streamingContent) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return prev;
          return [...prev, { role: "assistant", content: accumulated }];
        });
        setStreamingContent("");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm h-fit">
      <div className={`px-5 py-3 ${hasMessages ? "border-b border-zinc-200" : ""}`}>
        <h3 className="text-sm font-semibold">Ask about these repos</h3>
        <p className="text-xs text-zinc-500">
          {sessionId
            ? "Same agent that analyzed the code — it remembers everything it read."
            : "Agent can read source code to investigate deeper."}
        </p>
      </div>

      {hasMessages && (
        <div className="max-h-[500px] overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-50 border border-zinc-200 text-zinc-800"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="whitespace-pre-wrap break-words">
                    {formatMessage(msg.content)}
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-zinc-50 border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800">
                <div className="whitespace-pre-wrap break-words">
                  {formatMessage(streamingContent)}
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-500">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
                  Investigating...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={`${hasMessages ? "border-t border-zinc-200" : ""} px-5 py-3`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? "Waiting for response..." : "Ask about the analysis, code patterns, comparisons..."}
            disabled={isStreaming}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function formatMessage(text: string) {
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const content = part.slice(3, -3);
      const newlineIdx = content.indexOf("\n");
      const code = newlineIdx >= 0 ? content.slice(newlineIdx + 1) : content;
      return (
        <pre key={i} className="my-2 overflow-x-auto rounded bg-zinc-900 p-2.5 text-xs text-zinc-100">
          <code>{code}</code>
        </pre>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-zinc-200 px-1 py-0.5 text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

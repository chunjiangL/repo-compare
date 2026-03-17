"use client";

import { useEffect, useRef, useState } from "react";
import type { PipelineDiagram } from "@/types/analysis";

interface MermaidDiagramProps {
  definition: string;
  id: string;
}

function normalizeMermaid(def: string): string {
  // Force top-down layout for readability — LR gets too cramped
  return def.replace(/^graph\s+LR/m, "graph TD");
}

function MermaidDiagram({ definition, id }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          fontSize: 14,
          flowchart: {
            curve: "basis",
            padding: 16,
            nodeSpacing: 30,
            rankSpacing: 40,
            htmlLabels: true,
          },
          securityLevel: "strict",
        });

        if (cancelled || !containerRef.current) return;

        const normalized = normalizeMermaid(definition);
        const { svg } = await mermaid.render(`mermaid-${id}`, normalized);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Scale SVG to fit container
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
            svgEl.style.maxHeight = "680px";
            svgEl.style.height = "auto";
            svgEl.style.width = "auto";
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [definition, id]);

  if (error) {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
        <pre className="text-xs text-zinc-500 whitespace-pre-wrap">{definition}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-4"
      style={{ maxHeight: 720 }}
    />
  );
}

interface PipelineSectionProps {
  pipelines: PipelineDiagram[];
  repoName: string;
}

export function PipelineSection({ pipelines, repoName }: PipelineSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const stableId = repoName.replace(/[^a-zA-Z0-9]/g, "-");

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">Pipelines</span>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-zinc-100 px-4 py-4">
          {pipelines.map((pipeline, i) => (
            <div key={i} className="space-y-2">
              <div>
                <h4 className="text-sm font-medium">{pipeline.title}</h4>
                <p className="text-xs text-zinc-500">{pipeline.description}</p>
              </div>
              <MermaidDiagram
                definition={pipeline.mermaid}
                id={`${stableId}-${i}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { PipelineDiagram } from "@/types/analysis";

interface MermaidDiagramProps {
  definition: string;
  id: string;
}

function normalizeMermaid(def: string): string {
  let s = def.trim();
  // Force top-down
  s = s.replace(/^graph\s+LR/m, "graph TD");
  // Strip markdown fences if LLM wrapped it
  s = s.replace(/^```(?:mermaid)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  // Remove problematic characters in node IDs: parentheses, quotes, semicolons
  // Fix common LLM mistakes: `A(label)` is valid but `A(label with (parens))` breaks
  // Replace nested parens in labels with brackets
  s = s.replace(/\[([^\]]*)\(([^)]*)\)([^\]]*)\]/g, "[$1 $2 $3]");
  // Fix node IDs with spaces or special chars — replace with underscores
  s = s.replace(/^(\s*)([A-Za-z0-9_]+)\s*\[/gm, "$1$2[");
  // Remove any stray semicolons that break parsing
  s = s.replace(/;/g, "");
  return s;
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
          theme: "base",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          fontSize: 13,
          flowchart: {
            curve: "basis",
            padding: 16,
            nodeSpacing: 35,
            rankSpacing: 45,
            htmlLabels: true,
          },
          themeVariables: {
            primaryColor: "#f4f4f5",
            primaryTextColor: "#18181b",
            primaryBorderColor: "#d4d4d8",
            secondaryColor: "#fafafa",
            secondaryTextColor: "#3f3f46",
            secondaryBorderColor: "#e4e4e7",
            lineColor: "#a1a1aa",
            textColor: "#3f3f46",
            mainBkg: "#f4f4f5",
            nodeBorder: "#d4d4d8",
            edgeLabelBackground: "#ffffff",
            fontSize: "13px",
          },
          securityLevel: "strict",
        });

        if (cancelled || !containerRef.current) return;

        const normalized = normalizeMermaid(definition);
        const { svg } = await mermaid.render(`mermaid-${id}`, normalized);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;

          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.removeAttribute("height");
            svgEl.style.maxWidth = "100%";
            svgEl.style.maxHeight = "680px";
            svgEl.style.height = "auto";
            svgEl.style.width = "auto";

            // Round node corners
            svgEl.querySelectorAll(".node rect, .node polygon").forEach((el) => {
              (el as SVGElement).style.rx = "6";
              (el as SVGElement).style.ry = "6";
            });
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
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <pre className="text-xs text-zinc-500 whitespace-pre-wrap">{definition}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-auto rounded-lg border border-zinc-200 bg-white p-5"
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
              {pipeline.explanation && (
                <p className="text-xs leading-relaxed text-zinc-600 bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                  {pipeline.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

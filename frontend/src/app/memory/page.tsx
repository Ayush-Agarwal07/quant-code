"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Database, Search, Sparkles, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, Label, Pill, Prose, SectionHeader } from "@/components/ui/primitives";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { KindPill } from "@/components/ui/tags";
import type { ScoredLesson } from "@/types";

export default function MemoryPage() {
  // Search box state. Empty query -> the full produced-lessons listing.
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<ScoredLesson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<ApiError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const allLessons = useApi((s) => api.lessons(undefined, 8, s), []);
  const episodes = useApi((s) => api.episodes(s), []);

  const runSearch = (q: string) => {
    const trimmed = q.trim();
    setSubmitted(trimmed);
    controllerRef.current?.abort();
    if (!trimmed) {
      setResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearching(true);
    setSearchError(null);
    api
      .lessons(trimmed, 8, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          setResults(r);
          setSearching(false);
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setSearchError(
          e instanceof ApiError ? e : new ApiError(0, "search failed")
        );
        setResults([]);
        setSearching(false);
      });
  };

  useEffect(() => () => controllerRef.current?.abort(), []);

  const clearSearch = () => {
    setQuery("");
    runSearch("");
  };

  const isSearchMode = submitted.length > 0;
  const tableRows: ScoredLesson[] | null = isSearchMode ? results : allLessons.data;
  const tableLoading = isSearchMode ? searching : allLessons.loading;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label>Memory</Label>
          <Pill tone="good">
            <Database className="h-3 w-3" /> Redis
          </Pill>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Durable lessons, vector-searchable.
        </h1>
        <Prose className="max-w-2xl">
          Beyond caching: every critique distills into a reusable lesson stored in Redis with
          an embedding. Search runs a live semantic query; without a query you see every
          produced lesson across all runs.
        </Prose>
      </div>

      {/* Search box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
      >
        <div className="flex items-center gap-2 rounded border border-border bg-card p-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Semantic search lessons (e.g. lookahead bias, survivorship, momentum crash)"
            className="flex-1 bg-transparent px-1 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {submitted && (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="submit"
            className="flex items-center gap-1 rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Sparkles className="h-3 w-3" /> Search
          </button>
        </div>
      </form>

      {/* Lessons table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <SectionHeader
            title={isSearchMode ? "Search results" : "All produced lessons"}
            hint={
              isSearchMode
                ? `Live vector search for "${submitted}"`
                : "Every distinct lesson produced across runs."
            }
          />
          {isSearchMode && (
            <Pill tone="muted">{tableRows?.length ?? 0} hits</Pill>
          )}
        </div>

        {tableLoading ? (
          <LoadingState label="Searching memory" />
        ) : !isSearchMode && allLessons.error ? (
          <div className="p-6">
            <EmptyState
              variant="error"
              title="No lessons available"
              detail="Could not load lessons. Start the API with quantcode dashboard (port 8000)."
            />
          </div>
        ) : tableRows && tableRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th className="w-16">Score</Th>
                  <Th className="w-40">Kind</Th>
                  <Th>Lesson</Th>
                  <Th className="w-28">Source run</Th>
                  <Th className="w-20">Conf.</Th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ lesson, score }) => (
                  <tr
                    key={lesson.lesson_id}
                    className="border-b border-border/60 align-top transition-colors hover:bg-accent/20"
                  >
                    <Td className="font-mono text-[11px] text-foreground">
                      {score == null ? "—" : score.toFixed(3)}
                    </Td>
                    <Td>
                      <KindPill kind={lesson.kind} />
                    </Td>
                    <Td className="text-[12.5px] leading-relaxed text-foreground/90">
                      {lesson.text}
                      {lesson.source_critique && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          from critique: {lesson.source_critique}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/runs/${lesson.source_run_id}`}
                        className="font-mono text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                      >
                        {lesson.source_run_id}
                      </Link>
                    </Td>
                    <Td className="font-mono text-[11px] text-muted-foreground">
                      {lesson.confidence.toFixed(2)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isSearchMode ? (
          <div className="p-6">
            <EmptyState
              title="No matching lessons"
              detail={
                searchError
                  ? "Search failed."
                  : "Redis returned no results — either nothing matched, or the vector index is unavailable (search degrades to empty when Redis is absent). Try the unfiltered listing."
              }
            />
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No lessons yet"
              detail="No lessons have been produced. Run the pipeline to populate memory."
            />
          </div>
        )}
      </Card>

      {/* Episodes */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-5">
          <SectionHeader
            title="Episodic memory"
            hint="One durable record per run — a queryable projection of each research packet."
          />
        </div>
        {episodes.loading ? (
          <LoadingState label="Loading episodes" />
        ) : episodes.error || !episodes.data ? (
          <div className="p-6">
            <EmptyState
              variant="error"
              title="No episodes available"
              detail="Could not load episodes. Start the API with quantcode dashboard (port 8000)."
            />
          </div>
        ) : episodes.data.length === 0 ? (
          <p className="p-6 text-[12px] text-muted-foreground">No episodes yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {episodes.data.map((ep) => (
              <li key={ep.run_id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/runs/${ep.run_id}`}
                    className="font-mono text-[11px] font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {ep.run_id}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/85">
                    {ep.objective}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone="muted">retrieved {ep.retrieved_lesson_ids.length}</Pill>
                  <Pill tone="muted">produced {ep.produced_lesson_ids.length}</Pill>
                  <Pill tone="muted">{ep.strategy_names.length} strategies</Pill>
                  {ep.failed_feasibility.length > 0 && (
                    <Pill tone="warn">{ep.failed_feasibility.length} deferred</Pill>
                  )}
                </div>
                {ep.strategy_names.length > 0 && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Strategies: {ep.strategy_names.join(", ")}
                  </p>
                )}
                {ep.critique_summaries.length > 0 && (
                  <ul className="space-y-1.5">
                    {ep.critique_summaries.map((c, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85"
                      >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3 ${className ?? ""}`}>{children}</td>;
}

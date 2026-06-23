"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Element → class map. Headings use the display face, code uses mono, body
// stays readable. Tuned for the dark glass surface.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 font-display text-[20px] font-semibold tracking-tight text-white first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 font-display text-[17px] font-semibold tracking-tight text-white first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 font-display text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9fb0ff] first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[14.5px] leading-relaxed text-[#d6dae4] first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-[#c4cad6]">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#7cc0ff] underline decoration-[#7cc0ff]/30 underline-offset-2 transition-colors hover:decoration-[#7cc0ff]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-2 space-y-1 pl-1 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-[14.5px] text-[#d6dae4] marker:text-[#7cc0ff] first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative pl-4 text-[14.5px] leading-relaxed text-[#d6dae4] before:absolute before:left-0 before:top-[0.62em] before:size-1 before:-translate-y-1/2 before:rounded-full before:bg-[#5ee3c0] [ol>&]:pl-0 [ol>&]:before:hidden">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[#7cc0ff]/40 pl-3 text-[14px] italic text-[#aab2c0]">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = (className ?? "").includes("language-");
    if (isBlock) {
      return (
        <code className="block font-mono text-[12.5px] leading-relaxed text-[#cdd6f0]">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12.5px] text-[#5ee3c0]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0a0c12]/80 p-3.5 first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-white/[0.08]" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wide text-[#9aa3b2]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/[0.05] px-3 py-2 text-[#d6dae4]">
      {children}
    </td>
  ),
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[14.5px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

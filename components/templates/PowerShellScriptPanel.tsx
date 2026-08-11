"use client";

import { Highlight } from "prism-react-renderer";
import Prism from "prismjs";
import "prismjs/components/prism-powershell";
import { FileCode2 } from "lucide-react";

const TOKEN_CLASSNAMES: Readonly<Record<string, string>> = {
  boolean: "text-orange-300",
  builtin: "text-blue-300",
  "class-name": "text-yellow-200",
  comment: "text-slate-400 italic",
  function: "text-sky-300",
  keyword: "text-fuchsia-300",
  namespace: "text-amber-200",
  number: "text-orange-300",
  operator: "text-rose-300",
  parameter: "text-yellow-200",
  punctuation: "text-slate-400",
  string: "text-emerald-300",
  variable: "text-cyan-200",
};

interface PowerShellScriptPanelProps {
  id: string;
  title: string;
  content: string;
}

function getTokenClassName(types: readonly string[]): string {
  for (let index = types.length - 1; index >= 0; index -= 1) {
    const className = TOKEN_CLASSNAMES[types[index]];
    if (className) {
      return className;
    }
  }

  return "text-slate-100";
}

export function PowerShellScriptPanel({
  id,
  title,
  content,
}: PowerShellScriptPanelProps) {
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-2xl border border-border/70 bg-[#050816]"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs font-mono uppercase tracking-[0.24em] text-slate-300">
        <FileCode2 aria-hidden="true" className="size-3.5" />
        <h4 id={id}>{title}</h4>
      </div>
      <Highlight code={content} language="powershell" prism={Prism}>
        {({ tokens, getTokenProps }) => (
          <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-6 text-slate-100 selection:bg-white/20">
            <code className="font-mono">
              {tokens.map((line, lineIndex) => (
                <span key={`line-${lineIndex}`}>
                  {line.map((token, tokenIndex) => {
                    const tokenProps = getTokenProps({ token });

                    return (
                      <span
                        key={`token-${lineIndex}-${tokenIndex}`}
                        className={`${tokenProps.className} ${getTokenClassName(token.types)}`}
                      >
                        {tokenProps.children}
                      </span>
                    );
                  })}
                  {lineIndex < tokens.length - 1 ? "\n" : null}
                </span>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </section>
  );
}

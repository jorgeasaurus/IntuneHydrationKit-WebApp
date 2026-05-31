import { Fragment, ReactNode } from "react";

const JSON_TOKEN_PATTERN =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?::)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;

function getJsonTokenClassName(token: string): string {
  if (token.startsWith('"') && token.endsWith('":')) {
    return "text-cyan-300";
  }

  if (token.startsWith('"')) {
    return "text-emerald-300";
  }

  if (token === "true" || token === "false") {
    return "text-violet-300";
  }

  if (token === "null") {
    return "text-amber-300";
  }

  return "text-pink-300";
}

export function HighlightedJson({ payload }: { payload: unknown }) {
  const formattedJson = JSON.stringify(payload, null, 2);
  const lines = formattedJson.split("\n");

  return (
    <>
      {lines.map((line, lineIndex) => {
    const tokens: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
      const token = match[0];
      const startIndex = match.index ?? 0;

      if (startIndex > lastIndex) {
        tokens.push(
          <Fragment key={`text-${lineIndex}-${lastIndex}`}>
            {line.slice(lastIndex, startIndex)}
          </Fragment>
        );
      }

      tokens.push(
        <span key={`token-${lineIndex}-${startIndex}`} className={getJsonTokenClassName(token)}>
          {token}
        </span>
      );

      lastIndex = startIndex + token.length;
    }

    if (lastIndex < line.length) {
      tokens.push(
        <Fragment key={`tail-${lineIndex}-${lastIndex}`}>
          {line.slice(lastIndex)}
        </Fragment>
      );
    }

        return (
          <Fragment key={`line-${lineIndex}`}>
            {tokens}
            {lineIndex < lines.length - 1 ? "\n" : null}
          </Fragment>
        );
      })}
    </>
  );
}

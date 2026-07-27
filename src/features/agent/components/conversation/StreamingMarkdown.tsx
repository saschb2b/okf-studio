// An agent message while it is still being written.
//
// Two halves. The settled markdown above only re-parses when a block actually
// closes, so headings, lists and code fences stop changing type underneath the
// reader. The unsettled tail below is plain text split into words, each of which
// fades as it mounts — which is only possible *because* it is not inside
// `dangerouslySetInnerHTML`, where React cannot tell an old node from a new one.
//
// A finished message does not use this component at all: it renders as one
// parsed document with no spans and no animation, so a completed transcript
// carries zero streaming overhead.

import { renderMarkdown } from "@/shared/render/markdown.ts";
import { splitSettled, tailWords } from "./streamingText.ts";
import "./StreamingMarkdown.css";

interface StreamingMarkdownProps {
  /** The visible prefix, already smoothed by `useSmoothedStream`. */
  text: string;
  /** Off for reduced motion: words appear without fading. */
  animate: boolean;
}

export function StreamingMarkdown({ text, animate }: StreamingMarkdownProps) {
  const { settled, tail } = splitSettled(text);
  // No manual memoization, per the repo convention: the React Compiler keys this
  // on `settled`, which only changes when a block closes. That is the win — the
  // old code re-parsed the whole message on every arriving chunk, which is
  // quadratic over a long answer.
  const settledHtml = settled ? { __html: renderMarkdown(settled) } : null;
  const words = tailWords(tail);

  return (
    <div className="markdown agent-message__markdown">
      {settledHtml && (
        // renderMarkdown sanitizes untrusted agent output with DOMPurify.
        <div dangerouslySetInnerHTML={settledHtml} />
      )}
      {words.length > 0 && (
        <p className={`streaming-tail${animate ? " is-animated" : ""}`}>
          {words.map((word, index) => (
            // Index-keyed on purpose: the tail is append-only within a block, so
            // index *is* identity here, and it is what keeps already-shown words
            // mounted instead of remounting and re-fading the whole line.
            <span key={index}>{word}</span>
          ))}
          <span className="streaming-caret" aria-hidden="true" />
        </p>
      )}
    </div>
  );
}

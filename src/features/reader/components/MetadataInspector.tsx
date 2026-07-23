import { Check, Copy } from "lucide-react";
import { useState } from "react";
import "./MetadataInspector.css";

const MAX_DEPTH = 5;
const MAX_NODES = 256;
const MAX_CHILDREN = 64;
const MAX_SCALAR_CHARS = 2_048;
const MAX_COPY_CHARS = 65_536;

export const ODSF_METADATA_KEYS = ["tokens", "examples", "status", "applies_to"] as const;
const NO_EXCLUDED_KEYS: ReadonlySet<string> = new Set();

type MetadataNode =
  | {
      kind: "scalar";
      key: string;
      path: string;
      value: string;
      copyText: string;
      truncated: boolean;
    }
  | {
      kind: "branch";
      key: string;
      path: string;
      summary: string;
      children: MetadataNode[];
      copyText: string;
      truncated: boolean;
    }
  | {
      kind: "notice";
      key: string;
      path: string;
      value: string;
    };

interface BuildState {
  nodes: number;
}

function boundedObjectEntries(
  value: Record<string, unknown>,
  excluded: ReadonlySet<string> = NO_EXCLUDED_KEYS,
): {
  entries: [string, unknown][];
  hasMore: boolean;
} {
  const entries: [string, unknown][] = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (excluded.has(key)) continue;
    if (entries.length === MAX_CHILDREN) return { entries, hasMore: true };
    entries.push([key, value[key]]);
  }
  return { entries, hasMore: false };
}

function boundedText(value: string, limit: number): { text: string; truncated: boolean } {
  const characters = Array.from(value);
  if (characters.length <= limit) return { text: value, truncated: false };
  return {
    text: `${characters.slice(0, limit).join("")}…`,
    truncated: true,
  };
}

function scalarText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "[unsupported value]";
}

function boundedCopyValue(
  value: unknown,
  depth: number,
  state: BuildState,
  seen: WeakSet<object>,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) return "[additional value omitted]";
  if (typeof value === "string") return boundedText(value, MAX_SCALAR_CHARS).text;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return scalarText(value);
  if (seen.has(value)) return "[circular value omitted]";
  if (depth >= MAX_DEPTH) return "[nested value omitted]";
  seen.add(value);
  if (Array.isArray(value)) {
    const copy = value
      .slice(0, MAX_CHILDREN)
      .map((item) => boundedCopyValue(item, depth + 1, state, seen));
    if (value.length > MAX_CHILDREN) copy.push(`[${value.length - MAX_CHILDREN} items omitted]`);
    return copy;
  }
  const copy: Record<string, unknown> = {};
  const { entries, hasMore } = boundedObjectEntries(value as Record<string, unknown>);
  for (const [key, item] of entries) {
    copy[boundedText(key, 128).text] = boundedCopyValue(item, depth + 1, state, seen);
  }
  if (hasMore) copy["…"] = "additional fields omitted";
  return copy;
}

function boundedJson(value: unknown): { text: string; truncated: boolean } {
  let serialized: string;
  try {
    const bounded = boundedCopyValue(value, 0, { nodes: 0 }, new WeakSet());
    serialized = JSON.stringify(bounded, null, 2);
  } catch {
    serialized = scalarText(value);
  }
  return boundedText(serialized, MAX_COPY_CHARS);
}

function buildNode(
  key: string,
  value: unknown,
  path: string,
  depth: number,
  state: BuildState,
): MetadataNode {
  state.nodes += 1;
  const displayKey = boundedText(key, 128).text;
  const displayPath = boundedText(path, 512).text;
  if (state.nodes > MAX_NODES) {
    return {
      kind: "notice",
      key: displayKey,
      path: displayPath,
      value: "Additional metadata omitted at the 256-node limit.",
    };
  }

  const isArray = Array.isArray(value);
  const isObject = typeof value === "object" && value !== null && !isArray;
  if (!isArray && !isObject) {
    const display = boundedText(scalarText(value), MAX_SCALAR_CHARS);
    return {
      kind: "scalar",
      key: displayKey,
      path: displayPath,
      value: display.text,
      copyText: display.text,
      truncated: display.truncated,
    };
  }

  const objectEntries = isObject
    ? boundedObjectEntries(value as Record<string, unknown>)
    : null;
  const entries = isArray
    ? value.slice(0, MAX_CHILDREN).map((item, index) => [String(index), item] as const)
    : (objectEntries?.entries ?? []);
  const total = isArray ? value.length : entries.length;
  const hasMore = isArray ? value.length > entries.length : (objectEntries?.hasMore ?? false);
  const copy = boundedJson(value);
  if (depth >= MAX_DEPTH) {
    return {
      kind: "branch",
      key: displayKey,
      path: displayPath,
      summary: `${isArray ? "array" : "object"} · ${hasMore ? `${entries.length}+` : total} item${total === 1 ? "" : "s"}`,
      children: [{
        kind: "notice",
        key: "depth",
        path: displayPath,
        value: "Nested value omitted at the five-level display limit.",
      }],
      copyText: copy.text,
      truncated: true,
    };
  }

  const children = entries.map(([childKey, childValue]) => buildNode(
    childKey,
    childValue,
    isArray ? `${path}[${childKey}]` : `${path}.${childKey}`,
    depth + 1,
    state,
  ));
  if (hasMore) {
    children.push({
      kind: "notice",
      key: "more",
      path: displayPath,
      value: isArray
        ? `${value.length - entries.length} additional item${value.length - entries.length === 1 ? "" : "s"} omitted.`
        : "Additional fields omitted.",
    });
  }
  return {
    kind: "branch",
    key: displayKey,
    path: displayPath,
    summary: `${isArray ? "array" : "object"} · ${hasMore ? `${entries.length}+` : total} item${total === 1 ? "" : "s"}`,
    children,
    copyText: copy.text,
    truncated: copy.truncated || hasMore,
  };
}

export function inspectMetadata(
  values: Record<string, unknown>,
  excludedKeys: readonly string[] = [],
): MetadataNode[] {
  const state: BuildState = { nodes: 0 };
  const { entries, hasMore } = boundedObjectEntries(values, new Set(excludedKeys));
  const nodes = entries.map(([key, value]) => buildNode(key, value, key, 0, state));
  if (hasMore) {
    nodes.push({
      kind: "notice",
      key: "more",
      path: "",
      value: "Additional top-level fields omitted.",
    });
  }
  return nodes;
}

function CopyValue({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) return;
    try {
      await clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="metadata-copy"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => void copy()}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

function NodeChildren({ children, depth }: { children: MetadataNode[]; depth: number }) {
  return (
    <ul className="metadata-tree">
      {children.map((node, index) => (
        <MetadataTreeNode node={node} depth={depth} key={`${node.path}:${node.key}:${index}`} />
      ))}
    </ul>
  );
}

function MetadataTreeNode({ node, depth }: { node: MetadataNode; depth: number }) {
  if (node.kind === "notice") {
    return <li className="metadata-notice">{node.value}</li>;
  }
  if (node.kind === "scalar") {
    return (
      <li className="metadata-scalar">
        <span className="metadata-key">{node.key}</span>
        <code title={node.path}>{node.value}</code>
        <CopyValue text={node.copyText} label={node.path} />
        {node.truncated ? <span className="metadata-limit">display truncated</span> : null}
      </li>
    );
  }
  return (
    <li className="metadata-branch">
      <div className="metadata-branch-row">
        <details open={depth < 1}>
          <summary>
            <span className="metadata-key">{node.key}</span>
            <span className="metadata-summary">{node.summary}</span>
          </summary>
          <NodeChildren children={node.children} depth={depth + 1} />
          {node.truncated ? <span className="metadata-limit">bounded preview</span> : null}
        </details>
        <CopyValue text={node.copyText} label={node.path} />
      </div>
    </li>
  );
}

export function MetadataInspector({
  title,
  source,
  values,
  excludeKeys = [],
}: {
  title: string;
  source: string;
  values: Record<string, unknown>;
  excludeKeys?: readonly string[];
}) {
  const nodes = inspectMetadata(values, excludeKeys);
  if (nodes.length === 0) return null;

  return (
    <section className="metadata-inspector" aria-label={`${title} from ${source}`}>
      <header className="metadata-head">
        <h2>{title}</h2>
        <code>{source}</code>
      </header>
      <NodeChildren children={nodes} depth={0} />
    </section>
  );
}

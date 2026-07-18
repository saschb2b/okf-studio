import "../AgentConversation.css";

export interface OkfMentionOption {
  id: string;
  label: string;
  description: string;
  kind: "bundle" | "concept";
}

export interface OkfMention {
  start: number;
  query: string;
}

export function findOkfMention(text: string): OkfMention | null {
  const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(text);
  if (!match) return null;
  const atOffset = match[0].lastIndexOf("@");
  return { start: match.index + atOffset, query: match[1].toLocaleLowerCase() };
}

export function replaceOkfMention(text: string, mention: OkfMention, label: string): string {
  return `${text.slice(0, mention.start)}${label} `;
}

export function okfMentionOptions({
  mention,
  bundleName,
  activeConcept,
  concepts,
}: {
  mention: OkfMention | null;
  bundleName: string | null;
  activeConcept: { id: string; title: string } | null;
  concepts: readonly { id: string; title: string; type: string }[];
}): OkfMentionOption[] {
  if (!mention) return [];
  const query = mention.query;
  const options: OkfMentionOption[] = [];

  if (bundleName && (query.length === 0 || "bundle".includes(query) || bundleName.toLocaleLowerCase().includes(query))) {
    options.push({
      id: "bundle",
      label: bundleName,
      description: "Reference the active bundle",
      kind: "bundle",
    });
  }

  if (activeConcept && (
    query.length === 0 || "active".includes(query) ||
    activeConcept.title.toLocaleLowerCase().includes(query)
  )) {
    options.push({
      id: activeConcept.id,
      label: activeConcept.title,
      description: "Attach the concept open in Reader",
      kind: "concept",
    });
  }

  for (const concept of concepts) {
    if (options.some((option) => option.id === concept.id)) continue;
    const searchable = `${concept.title} ${concept.id} ${concept.type}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) continue;
    options.push({
      id: concept.id,
      label: concept.title,
      description: concept.type,
      kind: "concept",
    });
    if (options.length >= 6) break;
  }

  return options;
}

export function OkfMentionMenu({
  options,
  onSelect,
}: {
  options: readonly OkfMentionOption[];
  onSelect: (option: OkfMentionOption) => void;
}) {
  if (options.length === 0) return null;
  return (
    <section className="agent-mention-menu" aria-label="OKF context suggestions">
      <small>OKF context</small>
      <div>
        {options.map((option) => (
          <button
            key={`${option.kind}-${option.id}`}
            type="button"
            className="agent-mention-menu__option"
            aria-label={`${option.label}, ${option.description}`}
            onClick={() => onSelect(option)}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

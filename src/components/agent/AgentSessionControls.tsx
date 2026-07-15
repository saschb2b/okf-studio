import { Popover } from "@base-ui/react/popover";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { useId, useState } from "react";
import type { ReactElement } from "react";
import type {
  AgentSessionConfigOption,
  AgentSessionConfigValueInfo,
  AgentSessionConfigValueInput,
} from "@/agent/connection.ts";
import "./AgentSessionControls.css";

export interface AgentSessionConfigFailure {
  optionId: string;
  requestedValue: AgentSessionConfigValueInput;
  message: string;
}

interface AgentSessionControlsProps {
  options: readonly AgentSessionConfigOption[];
  pendingOptionId: string | null;
  failure: AgentSessionConfigFailure | null;
  favoriteScope: string;
  disabled: boolean;
  onChange: (option: AgentSessionConfigOption, value: AgentSessionConfigValueInput) => void;
  onRetry: () => void;
}

const CATEGORY_PRIORITY = new Map([
  ["mode", 0],
  ["model", 1],
  ["thought-level", 2],
  ["reasoning", 2],
  ["model-config", 3],
]);

function normalizedCategory(option: AgentSessionConfigOption): string {
  return option.category?.trim().toLowerCase() ?? "";
}

export function orderedSessionOptions(
  options: readonly AgentSessionConfigOption[],
): readonly AgentSessionConfigOption[] {
  return options
    .map((option, index) => ({ option, index }))
    .sort((left, right) => {
      const leftPriority = CATEGORY_PRIORITY.get(normalizedCategory(left.option)) ?? 4;
      const rightPriority = CATEGORY_PRIORITY.get(normalizedCategory(right.option)) ?? 4;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ option }) => option);
}

function isPrimaryOption(
  option: AgentSessionConfigOption,
): option is Extract<AgentSessionConfigOption, { type: "select" }> {
  const category = normalizedCategory(option);
  return option.type === "select" && (
    category === "mode" || category === "model" || category === "thought-level" ||
    category === "reasoning"
  );
}

function selectValues(option: Extract<AgentSessionConfigOption, { type: "select" }>) {
  return option.groups.flatMap((group) => group.options);
}

function currentValueName(option: AgentSessionConfigOption): string {
  if (option.type === "boolean") return option.currentValue ? "On" : "Off";
  return selectValues(option).find((value) => value.value === option.currentValue)?.name ??
    option.currentValue;
}

function favoritesKey(scope: string, optionId: string): string {
  return `okf-studio.agent-config-favorites.${scope}.${optionId}`;
}

function readFavorites(scope: string, optionId: string): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(favoritesKey(scope, optionId)) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string =>
      typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function writeFavorites(scope: string, optionId: string, favorites: ReadonlySet<string>) {
  try {
    localStorage.setItem(favoritesKey(scope, optionId), JSON.stringify([...favorites]));
  } catch {
    // Favorites are a local convenience. A blocked storage API must not block configuration.
  }
}

export function AgentSessionControls({
  options,
  pendingOptionId,
  failure,
  favoriteScope,
  disabled,
  onChange,
  onRetry,
}: AgentSessionControlsProps) {
  const ordered = orderedSessionOptions(options);
  const primary = ordered.filter(isPrimaryOption);
  const secondary = ordered.filter((option) => !isPrimaryOption(option));
  const compactOptions = [...primary.filter((option) => {
    const category = normalizedCategory(option);
    return category === "thought-level" || category === "reasoning";
  }), ...secondary];
  const secondarySummary = secondary.map((option) =>
    `${option.name}: ${currentValueName(option)}`).join(", ");
  const compactSummary = compactOptions.map((option) =>
    `${option.name}: ${currentValueName(option)}`).join(", ");

  if (ordered.length === 0) return null;

  return (
    <div className="agent-session-controls">
      <div
        className="agent-session-controls__rail"
        role="group"
        aria-label="Agent session configuration"
      >
        {primary.map((option) => (
          <SessionOptionControl
            key={option.id}
            option={option}
            favoriteScope={favoriteScope}
            pending={pendingOptionId === option.id}
            disabled={disabled || pendingOptionId !== null}
            onChange={onChange}
          />
        ))}
        {secondary.length > 0 && (
          <SessionConfigurationPopover
            className="agent-session-control--wide-configuration"
            options={secondary}
            favoriteScope={favoriteScope}
            summary={secondarySummary}
            pendingOptionId={pendingOptionId}
            disabled={disabled}
            onChange={onChange}
          />
        )}
        {compactOptions.length > 0 && (
          <SessionConfigurationPopover
            className="agent-session-control--compact-configuration"
            options={compactOptions}
            favoriteScope={favoriteScope}
            summary={compactSummary}
            pendingOptionId={pendingOptionId}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>
      {failure && (
        <div className="agent-session-controls__error">
          <p role="alert" title={failure.message}>
            {options.find((option) => option.id === failure.optionId)?.name ?? "Session option"}
            {" change failed. "}{failure.message}
          </p>
          <button
            type="button"
            className="btn ghost"
            disabled={disabled || pendingOptionId !== null}
            onClick={onRetry}
          >
            <RotateCcw size={13} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function SessionOptionControl({
  option,
  favoriteScope,
  pending,
  disabled,
  onChange,
}: {
  option: Extract<AgentSessionConfigOption, { type: "select" }>;
  favoriteScope: string;
  pending: boolean;
  disabled: boolean;
  onChange: AgentSessionControlsProps["onChange"];
}) {
  return (
    <SelectOptionPopover
      option={option}
      favoriteScope={favoriteScope}
      disabled={disabled}
      onSelect={(value) => onChange(option, { type: "select", value })}
      trigger={(
        <button
          type="button"
          className={`agent-session-control agent-session-control--${normalizedCategory(option) || "custom"}`}
          aria-label={`${option.name}: ${currentValueName(option)}`}
          title={option.description ?? `${option.name}: ${currentValueName(option)}`}
          disabled={disabled}
        >
          <span>{currentValueName(option)}</span>
          {pending
            ? <LoaderCircle className="agent-session-control__spinner" size={12} aria-hidden="true" />
            : <ChevronDown size={12} aria-hidden="true" />}
        </button>
      )}
    />
  );
}

function SessionConfigurationPopover({
  className,
  options,
  favoriteScope,
  summary,
  pendingOptionId,
  disabled,
  onChange,
}: {
  className: string;
  options: readonly AgentSessionConfigOption[];
  favoriteScope: string;
  summary: string;
  pendingOptionId: string | null;
  disabled: boolean;
  onChange: AgentSessionControlsProps["onChange"];
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={(
          <button
            type="button"
            className={`agent-session-control agent-session-control--configuration ${className}`}
            aria-label={`Configure session. ${summary}`}
            title={summary}
            disabled={disabled}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup className="ui-popover agent-session-configuration" aria-label="Configure session">
            <header>
              <strong>Configure session</strong>
              <span>Choices supplied by the active agent</span>
            </header>
            <div className="agent-session-configuration__options">
              {options.map((option) => option.type === "boolean" ? (
                <label key={option.id} className="agent-session-boolean">
                  <span>
                    <strong>{option.name}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  <input
                    type="checkbox"
                    checked={option.currentValue}
                    disabled={disabled || pendingOptionId !== null}
                    onChange={(event) => onChange(option, {
                      type: "boolean",
                      value: event.target.checked,
                    })}
                  />
                </label>
              ) : (
                <div key={option.id} className="agent-session-configuration__select">
                  <span>
                    <strong>{option.name}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  <SessionOptionControl
                    option={option}
                    favoriteScope={favoriteScope}
                    pending={pendingOptionId === option.id}
                    disabled={disabled || pendingOptionId !== null}
                    onChange={onChange}
                  />
                </div>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SelectOptionPopover({
  option,
  favoriteScope,
  disabled,
  trigger,
  onSelect,
}: {
  option: Extract<AgentSessionConfigOption, { type: "select" }>;
  favoriteScope: string;
  disabled: boolean;
  trigger: ReactElement;
  onSelect: (value: string) => void;
}) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => readFavorites(favoriteScope, option.id),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = option.groups.map((group) => ({
    ...group,
    options: group.options.filter((value) => !normalizedQuery ||
      `${value.name} ${value.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)),
  })).filter((group) => group.options.length > 0);

  function choose(value: string) {
    onSelect(value);
    setOpen(false);
    setQuery("");
  }

  function toggleFavorite(value: AgentSessionConfigValueInfo) {
    const next = new Set(favorites);
    if (next.has(value.value)) next.delete(value.value);
    else next.add(value.value);
    setFavorites(next);
    writeFavorites(favoriteScope, option.id, next);
  }

  function cycleValue(direction: -1 | 1) {
    const values = selectValues(option);
    if (values.length < 2) return;
    const current = values.findIndex((value) => value.value === option.currentValue);
    const next = values[(current + direction + values.length) % values.length];
    choose(next.value);
  }

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    }}>
      <Popover.Trigger
        render={trigger}
        disabled={disabled}
        onKeyDown={(event) => {
          if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          cycleValue(event.key === "ArrowLeft" ? -1 : 1);
        }}
      />
      <Popover.Portal>
        <Popover.Positioner
          className="ui-popover-positioner"
          side="top"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup className="ui-popover agent-session-picker" aria-label={`Select ${option.name}`}>
            <label className="agent-session-picker__search" htmlFor={searchId}>
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">Search {option.name}</span>
              <input
                id={searchId}
                autoComplete="off"
                placeholder="Select an option..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="agent-session-picker__values">
              {groups.map((group, groupIndex) => (
                <section key={group.id ?? `group-${groupIndex}`}>
                  {group.name && <h3>{group.name}</h3>}
                  {group.options.map((value) => {
                    const selected = value.value === option.currentValue;
                    const favorite = favorites.has(value.value);
                    return (
                      <div key={value.value} className="agent-session-picker__value">
                        <button
                          type="button"
                          className="agent-session-picker__choice"
                          aria-current={selected ? "true" : undefined}
                          onClick={() => choose(value.value)}
                        >
                          <span>
                            <strong>{value.name}</strong>
                            {value.description && <small>{value.description}</small>}
                          </span>
                          {selected && <Check size={14} aria-label="Current" />}
                        </button>
                        <button
                          type="button"
                          className="agent-session-picker__favorite"
                          aria-label={`${favorite ? "Remove" : "Add"} ${value.name} ${favorite ? "from" : "to"} favorites`}
                          aria-pressed={favorite}
                          onClick={() => toggleFavorite(value)}
                        >
                          <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))}
              {groups.length === 0 && <p>No matching options.</p>}
            </div>
            <p className="agent-session-picker__hint">Alt + Left or Right cycles advertised choices.</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

import { useEffect, useState, type ChangeEvent } from "react";
import type { GroupColor, GroupingRule } from "../../src/core/types";
import { validateSettings } from "../../src/core/rule-validation";
import {
  exportSettings,
  mergeRules,
  previewImport,
  type ImportPreview,
} from "../../src/migration/import-export";
import { loadSettings, saveSettings } from "../../src/ui/storage";

const colors: GroupColor[] = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

export function OptionsApp() {
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<ImportPreview>();

  useEffect(() => {
    void loadSettings().then((settings) => setRules(settings.rules));
  }, []);

  function addRule() {
    setRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "New group",
        color: "blue",
        patterns: ["example.com/*"],
        priority: current.length,
        enabled: true,
        createdAt: Date.now(),
      },
    ]);
  }

  function updateRule(id: string, patch: Partial<GroupingRule>) {
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  }

  function moveRule(index: number, direction: -1 | 1) {
    setRules((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const selected = next[index];
      const displaced = next[target];
      if (!selected || !displaced) return current;
      next[index] = displaced;
      next[target] = selected;
      return next;
    });
  }

  async function persist() {
    const settings = await loadSettings();
    const candidate = {
      ...settings,
      rules: rules.map((rule, index) => ({ ...rule, priority: index })),
    };
    const validation = validateSettings(candidate);
    if (!validation.value || validation.errors.length > 0) {
      setMessage(validation.errors.join(" ") || "Settings are invalid.");
      return;
    }
    await saveSettings(validation.value);
    setRules(validation.value.rules);
    setMessage("Saved.");
  }

  async function downloadExport() {
    const settings = await loadSettings();
    const blob = new Blob([exportSettings({ ...settings, rules })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `autogrouping-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    const preview = previewImport(await file.text());
    if (!preview.settings || preview.errors.length > 0) {
      setPendingImport(undefined);
      setMessage(preview.errors.join(" ") || "Import failed.");
      return;
    }
    setPendingImport(preview);
    setMessage("");
  }

  function applyImport(mode: "merge" | "replace") {
    const incoming = pendingImport?.settings?.rules;
    if (!incoming) return;
    setRules((current) => (mode === "replace" ? incoming : mergeRules(current, incoming)));
    setMessage(
      pendingImport.warnings.join(" ") ||
        `Imported ${incoming.length} rule${incoming.length === 1 ? "" : "s"}. Review and save.`,
    );
    setPendingImport(undefined);
  }

  return (
    <main>
      <header>
        <div>
          <h1>AutoGrouping rules</h1>
          <p>Rules run from top to bottom. Existing external groups always take priority.</p>
        </div>
        <div className="toolbar">
          <button onClick={addRule}>Add rule</button>
          <button onClick={() => void downloadExport()}>Export</button>
          <label className="button">
            Import
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <button className="primary" onClick={() => void persist()}>
            Save
          </button>
        </div>
      </header>

      {pendingImport?.settings && (
        <section className="import-preview">
          <div>
            <strong>Import preview</strong>
            <p>
              {pendingImport.settings.rules.length} rule
              {pendingImport.settings.rules.length === 1 ? "" : "s"} from {pendingImport.source}
              {pendingImport.warnings.length > 0 ? ` — ${pendingImport.warnings.join(" ")}` : ""}
            </p>
          </div>
          <div className="toolbar">
            <button onClick={() => applyImport("merge")}>Merge</button>
            <button onClick={() => applyImport("replace")}>Replace all</button>
            <button onClick={() => setPendingImport(undefined)}>Cancel</button>
          </div>
        </section>
      )}

      {message && <p className="message">{message}</p>}

      <section className="rules">
        {rules.length === 0 && (
          <div className="empty">
            <strong>No rules yet</strong>
            <p>Add a rule or import an existing JSON backup.</p>
          </div>
        )}
        {rules.map((rule, index) => (
          <article key={rule.id}>
            <div className="priority-controls">
              <button
                aria-label={`Move ${rule.name} up`}
                disabled={index === 0}
                onClick={() => moveRule(index, -1)}
              >
                ↑
              </button>
              <span className="order">{index + 1}</span>
              <button
                aria-label={`Move ${rule.name} down`}
                disabled={index === rules.length - 1}
                onClick={() => moveRule(index, 1)}
              >
                ↓
              </button>
            </div>
            <div className="fields">
              <input
                aria-label="Group name"
                value={rule.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateRule(rule.id, { name: event.target.value })
                }
              />
              <textarea
                aria-label="URL patterns"
                value={rule.patterns.join("\n")}
                rows={3}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  updateRule(rule.id, {
                    patterns: event.target.value
                      .split("\n")
                      .map((value: string) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <select
              aria-label="Group color"
              value={rule.color}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateRule(rule.id, { color: event.target.value as GroupColor })
              }
            >
              {colors.map((color) => (
                <option key={color}>{color}</option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateRule(rule.id, { enabled: event.target.checked })
                }
              />{" "}
              Enabled
            </label>
            <button
              className="danger"
              onClick={() =>
                setRules((current) => current.filter((item) => item.id !== rule.id))
              }
            >
              Delete
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

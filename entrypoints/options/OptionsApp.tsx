import { useEffect, useState } from "react";
import type { GroupColor, GroupingRule } from "../../src/core/types";
import { exportSettings, mergeRules, previewImport } from "../../src/migration/import-export";
import { loadSettings, saveSettings } from "../../src/ui/storage";

const colors: GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export function OptionsApp() {
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadSettings().then((settings) => setRules(settings.rules)); }, []);

  function addRule() {
    setRules((current) => [...current, {
      id: crypto.randomUUID(), name: "New group", color: "blue", patterns: ["example.com/*"],
      priority: current.length, enabled: true, createdAt: Date.now(),
    }]);
  }

  function updateRule(id: string, patch: Partial<GroupingRule>) {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  async function persist() {
    const settings = await loadSettings();
    await saveSettings({ ...settings, rules: rules.map((rule, index) => ({ ...rule, priority: index })) });
    setMessage("Saved.");
  }

  async function downloadExport() {
    const settings = await loadSettings();
    const blob = new Blob([exportSettings({ ...settings, rules })], { type: "application/json" });
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
      setMessage(preview.errors.join(" ") || "Import failed.");
      return;
    }
    setRules((current) => mergeRules(current, preview.settings?.rules ?? []));
    setMessage(preview.warnings.join(" ") || "Import ready. Review and save.");
  }

  return (
    <main>
      <header>
        <div><h1>AutoGrouping rules</h1><p>Rules run from top to bottom. Existing external groups always take priority.</p></div>
        <div className="toolbar">
          <button onClick={addRule}>Add rule</button>
          <button onClick={() => void downloadExport()}>Export</button>
          <label className="button">Import<input type="file" accept="application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0]; if (file) void importFile(file);
          }} /></label>
          <button className="primary" onClick={() => void persist()}>Save</button>
        </div>
      </header>
      {message && <p className="message">{message}</p>}
      <section className="rules">
        {rules.map((rule, index) => (
          <article key={rule.id}>
            <span className="order">{index + 1}</span>
            <div className="fields">
              <input value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })} />
              <textarea value={rule.patterns.join("\n")} rows={3} onChange={(event) => updateRule(rule.id, {
                patterns: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean),
              })} />
            </div>
            <select value={rule.color} onChange={(event) => updateRule(rule.id, { color: event.target.value as GroupColor })}>
              {colors.map((color) => <option key={color}>{color}</option>)}
            </select>
            <label><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} /> Enabled</label>
            <button className="danger" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}>Delete</button>
          </article>
        ))}
      </section>
    </main>
  );
}

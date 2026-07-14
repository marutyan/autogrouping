import { useEffect, useState, type ChangeEvent } from "react";
import type { GroupingRule, TabStateRecord } from "../../src/core/types";
import { validateSettings } from "../../src/core/rule-validation";
import { GROUP_COLORS, GROUP_COLOR_HEX } from "../../src/ui/group-colors";
import { loadSettings, saveSettings } from "../../src/ui/storage";

interface StatusResponse {
	ok: boolean;
	state?: TabStateRecord;
}

type SiteScope = "site" | "path" | "page";

export function PopupApp() {
	const [enabled, setEnabled] = useState(true);
	const [rules, setRules] = useState<GroupingRule[]>([]);
	const [tab, setTab] = useState<chrome.tabs.Tab>();
	const [state, setState] = useState<TabStateRecord>();
	const [draft, setDraft] = useState<GroupingRule>();
	const [targetInput, setTargetInput] = useState("");
	const [targetScope, setTargetScope] = useState<SiteScope>("site");
	const [message, setMessage] = useState("");

	useEffect(() => {
		void (async () => {
			const settings = await loadSettings();
			setEnabled(settings.enabled);
			setRules(settings.rules);
			const [activeTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			setTab(activeTab);
			await refreshStatus(activeTab);
		})();
	}, []);

	async function refreshStatus(activeTab: chrome.tabs.Tab | undefined = tab) {
		if (activeTab?.id === undefined) return;
		const response = await safeSendMessage<StatusResponse>({
			type: "get-status",
			tabId: activeTab.id,
		});
		setState(response?.state);
	}

	async function toggleEnabled() {
		const settings = await loadSettings();
		const next = !enabled;
		await saveSettings({ ...settings, enabled: next });
		setEnabled(next);
		setMessage(
			next ? "Automatic grouping resumed." : "Automatic grouping paused.",
		);
	}

	async function send(
		type: "return-tab" | "protect-tab" | "reevaluate-window",
	) {
		if (!tab) return;
		const response = await safeSendMessage({
			type,
			tabId: tab.id,
			windowId: tab.windowId,
		});
		if (response === undefined) {
			setMessage(
				"Background service is restarting. Reopen the popup and try again.",
			);
			return;
		}
		await refreshStatus();
	}

	function beginAddRule() {
		setMessage("");
		setTargetInput("");
		setTargetScope("site");
		const initialPattern = defaultPattern(tab);
		setDraft({
			id: crypto.randomUUID(),
			name: suggestedGroupName(tab),
			color: "blue",
			patterns: initialPattern ? [initialPattern] : [],
			priority: rules.length,
			enabled: true,
			createdAt: Date.now(),
		});
	}

	function beginEditRule(rule: GroupingRule) {
		setMessage("");
		setTargetInput("");
		setTargetScope("site");
		setDraft({ ...rule, patterns: [...rule.patterns] });
	}

	function addTarget(value = targetInput, scope = targetScope) {
		if (!draft) return;
		const pattern = patternFromInput(value, scope);
		if (!pattern) {
			setMessage("Enter a valid URL or domain, such as example.com.");
			return;
		}
		if (draft.patterns.includes(pattern)) {
			setMessage("That target is already included.");
			return;
		}
		setDraft({ ...draft, patterns: [...draft.patterns, pattern] });
		setTargetInput("");
		setMessage("");
	}

	function addCurrentSite() {
		if (!tab?.url) return;
		addTarget(tab.url, "site");
	}

	function removeTarget(pattern: string) {
		if (!draft) return;
		setDraft({
			...draft,
			patterns: draft.patterns.filter((item) => item !== pattern),
		});
	}

	async function persistDraft() {
		if (!draft) return;
		const settings = await loadSettings();
		const exists = rules.some((rule) => rule.id === draft.id);
		const nextRules = (
			exists
				? rules.map((rule) => (rule.id === draft.id ? draft : rule))
				: [...rules, draft]
		).map((rule, index) => ({ ...rule, priority: index }));
		const validation = validateSettings({ ...settings, rules: nextRules });
		if (!validation.value || validation.errors.length > 0) {
			setMessage(validation.errors.join(" ") || "Rule is invalid.");
			return;
		}
		await saveSettings(validation.value);
		setRules(validation.value.rules);
		setDraft(undefined);
		setMessage("Saved.");
		if (tab?.windowId !== undefined) {
			await safeSendMessage({
				type: "reevaluate-window",
				windowId: tab.windowId,
			});
		}
	}

	async function deleteDraft() {
		if (!draft) return;
		const settings = await loadSettings();
		const nextRules = rules
			.filter((rule) => rule.id !== draft.id)
			.map((rule, index) => ({ ...rule, priority: index }));
		await saveSettings({ ...settings, rules: nextRules });
		setRules(nextRules);
		setDraft(undefined);
		setMessage("Deleted.");
		if (tab?.windowId !== undefined) {
			await safeSendMessage({
				type: "reevaluate-window",
				windowId: tab.windowId,
			});
		}
	}

	return (
		<main>
			<header>
				<div>
					<h1>AutoGrouping</h1>
					<p>Organize tabs by site without leaving this popup.</p>
				</div>
				<button
					type="button"
					className={
						enabled ? "automation-toggle running" : "automation-toggle paused"
					}
					onClick={() => void toggleEnabled()}
					aria-pressed={enabled}
				>
					<span className="automation-dot" aria-hidden="true" />
					<span>
						<small>Automatic grouping</small>
						<strong>{enabled ? "Running" : "Paused"}</strong>
					</span>
				</button>
			</header>

			<div className="current-status">
				<span>Current tab</span>
				<strong>{formatState(state?.state)}</strong>
			</div>

			<section className="groups-section">
				<div className="section-heading">
					<div>
						<h2>Groups</h2>
						<span className="group-count">{rules.length}</span>
					</div>
					<button type="button" className="add-button" onClick={beginAddRule}>
						+ Add group
					</button>
				</div>

				<div className="group-table">
					<div className="table-header">
						<span className="table-heading">Name</span>
						<span className="table-heading">Target sites</span>
						<span className="table-heading">Color</span>
						<span aria-hidden="true" />
					</div>

					{rules.length === 0 && (
						<button type="button" className="empty-rule" onClick={beginAddRule}>
							No groups yet. Add the current site as your first group.
						</button>
					)}

					{rules.map((rule) => (
						<div
							className={rule.enabled ? "rule-row" : "rule-row disabled"}
							key={rule.id}
						>
							<button
								type="button"
								className="name-cell"
								onClick={() => beginEditRule(rule)}
							>
								<strong>{rule.name}</strong>
								{!rule.enabled && <small>Paused</small>}
							</button>
							<button
								type="button"
								className="targets-cell"
								onClick={() => beginEditRule(rule)}
							>
								{rule.patterns.slice(0, 3).map((pattern) => {
									const target = describePattern(pattern);
									return (
										<span className="target-chip" title={pattern} key={pattern}>
											<strong>{target.label}</strong>
											<small>{target.scope}</small>
										</span>
									);
								})}
								{rule.patterns.length > 3 && (
									<span className="target-overflow">
										+{rule.patterns.length - 3}
									</span>
								)}
							</button>
							<span
								className="table-color"
								style={{ backgroundColor: GROUP_COLOR_HEX[rule.color] }}
								title={rule.color}
								aria-label={`${rule.color} group color`}
								role="img"
							/>
							<button
								type="button"
								className="edit-button"
								aria-label={`Edit ${rule.name}`}
								onClick={() => beginEditRule(rule)}
							>
								⋯
							</button>
						</div>
					))}
				</div>
			</section>

			{draft && (
				<section className="editor">
					<div className="editor-heading">
						<h2>
							{rules.some((rule) => rule.id === draft.id)
								? "Edit group"
								: "Add group"}
						</h2>
						<button
							type="button"
							className="icon-button"
							onClick={() => setDraft(undefined)}
						>
							×
						</button>
					</div>

					<label className="field">
						<span className="field-label">Group name</span>
						<input
							value={draft.name}
							onChange={(event: ChangeEvent<HTMLInputElement>) =>
								setDraft({ ...draft, name: event.target.value })
							}
						/>
					</label>

					<div className="field">
						<div className="field-heading">
							<span className="field-label">Target sites</span>
							{tab?.url && (
								<button
									type="button"
									className="text-button"
									onClick={addCurrentSite}
								>
									+ Current site
								</button>
							)}
						</div>

						<div className="target-list">
							{draft.patterns.length === 0 && <p>No sites selected.</p>}
							{draft.patterns.map((pattern) => {
								const target = describePattern(pattern);
								return (
									<span
										className="editable-target"
										key={pattern}
										title={pattern}
									>
										<span className="editable-target-copy">
											<strong>{target.label}</strong>
											<small>{target.scope}</small>
										</span>
										<button
											type="button"
											aria-label={`Remove ${target.label}`}
											onClick={() => removeTarget(pattern)}
										>
											×
										</button>
									</span>
								);
							})}
						</div>

						<div className="target-adder">
							<input
								value={targetInput}
								placeholder="URL or domain, e.g. github.com"
								onChange={(event: ChangeEvent<HTMLInputElement>) =>
									setTargetInput(event.target.value)
								}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addTarget();
									}
								}}
							/>
							<select
								value={targetScope}
								aria-label="Target scope"
								onChange={(event: ChangeEvent<HTMLSelectElement>) =>
									setTargetScope(event.target.value as SiteScope)
								}
							>
								<option value="site">Entire site</option>
								<option value="path">This path</option>
								<option value="page">This page</option>
							</select>
							<button type="button" onClick={() => addTarget()}>
								Add
							</button>
						</div>
					</div>

					<fieldset>
						<legend>Color</legend>
						<div className="color-picker">
							{GROUP_COLORS.map((color) => (
								<button
									type="button"
									key={color}
									className={
										draft.color === color
											? "color-swatch selected"
											: "color-swatch"
									}
									style={{ backgroundColor: GROUP_COLOR_HEX[color] }}
									aria-label={color}
									aria-pressed={draft.color === color}
									onClick={() => setDraft({ ...draft, color })}
								/>
							))}
						</div>
					</fieldset>

					<details className="advanced-patterns">
						<summary>Advanced URL patterns</summary>
						<p>
							One wildcard pattern per line. Most users do not need to edit
							these directly.
						</p>
						<textarea
							rows={3}
							value={draft.patterns.join("\n")}
							onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
								setDraft({
									...draft,
									patterns: event.target.value
										.split("\n")
										.map((value) => value.trim())
										.filter(Boolean),
								})
							}
						/>
					</details>

					<label className="enabled-control">
						<input
							type="checkbox"
							checked={draft.enabled}
							onChange={(event: ChangeEvent<HTMLInputElement>) =>
								setDraft({ ...draft, enabled: event.target.checked })
							}
						/>
						Use this automatic rule
					</label>

					<div className="editor-actions">
						{rules.some((rule) => rule.id === draft.id) && (
							<button
								type="button"
								className="danger"
								onClick={() => void deleteDraft()}
							>
								Delete
							</button>
						)}
						<button type="button" onClick={() => setDraft(undefined)}>
							Cancel
						</button>
						<button
							type="button"
							className="primary"
							onClick={() => void persistDraft()}
						>
							Save
						</button>
					</div>
				</section>
			)}

			{message && <p className="message">{message}</p>}

			<details className="tab-actions">
				<summary>Current tab actions</summary>
				<div className="actions">
					<button type="button" onClick={() => void send("return-tab")}>
						Return to automation
					</button>
					<button type="button" onClick={() => void send("protect-tab")}>
						Protect this tab
					</button>
					<button type="button" onClick={() => void send("reevaluate-window")}>
						Re-evaluate window
					</button>
				</div>
			</details>

			<button
				type="button"
				className="advanced"
				onClick={() => void chrome.runtime.openOptionsPage()}
			>
				Advanced settings
			</button>
		</main>
	);
}

async function safeSendMessage<T = unknown>(
	message: unknown,
): Promise<T | undefined> {
	try {
		return (await chrome.runtime.sendMessage(message)) as T;
	} catch {
		return undefined;
	}
}

function patternFromInput(value: string, scope: SiteScope): string | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		const url = new URL(
			trimmed.includes("://") ? trimmed : `https://${trimmed}`,
		);
		if (!/^https?:$/.test(url.protocol) || !url.hostname) return undefined;
		if (scope === "site") return `${url.hostname}/*`;
		if (scope === "page") return `${url.hostname}${url.pathname}${url.search}`;
		const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
		return `${url.hostname}${path === "/" ? "/*" : `${path}*`}`;
	} catch {
		return undefined;
	}
}

function defaultPattern(tab: chrome.tabs.Tab | undefined): string {
	return tab?.url ? (patternFromInput(tab.url, "site") ?? "") : "";
}

function suggestedGroupName(tab: chrome.tabs.Tab | undefined): string {
	if (!tab?.url) return "New group";
	try {
		const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
		return hostname.split(".")[0] || "New group";
	} catch {
		return "New group";
	}
}

function describePattern(pattern: string): { label: string; scope: string } {
	const normalized = pattern
		.replace(/^\*:\/\//, "")
		.replace(/^https?:\/\//, "");
	const slashIndex = normalized.indexOf("/");
	const hostname =
		slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
	const path = slashIndex === -1 ? "" : normalized.slice(slashIndex);
	if (path === "/*") return { label: hostname, scope: "Entire site" };
	if (!path)
		return {
			label: hostname,
			scope: normalized.includes("*") ? "Custom" : "Exact host",
		};
	if (path.includes("*")) {
		return { label: hostname, scope: `${path.replaceAll("*", "…")} path` };
	}
	return { label: hostname, scope: "Exact page" };
}

function formatState(state: TabStateRecord["state"] | undefined): string {
	switch (state) {
		case "managed":
			return "Managed by AutoGrouping";
		case "protected-external":
			return "Protected from automation";
		case "protected-split-view":
			return "Protected by Split View";
		case "ignored-pinned":
			return "Pinned and ignored";
		case "unmatched":
			return "No matching rule";
		default:
			return "Waiting";
	}
}

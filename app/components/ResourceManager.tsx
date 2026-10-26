"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import type { ResourceConfig, ResourceField } from "../../lib/resources";

type Row = Record<string, unknown>;
type Option = { value: string; label: string };

const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

export default function ResourceManager({ config }: { config: ResourceConfig }) {
    const supabase = useMemo(() => createClient(), []);
    const pk = config.primaryKey ?? "id";
    const hasActions = !!(config.canCreate || config.canUpdate || config.canDelete);

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState<string | null>(null); // a row's key, or "new"
    const [draft, setDraft] = useState<Row>({});
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState("");
    const [options, setOptions] = useState<Record<string, Option[]>>({});

    const load = useCallback(async () => {
        setLoading(true);
        let q = supabase.from(config.table).select("*");
        for (const o of config.orderBy ?? [{ column: pk, ascending: false }]) {
            q = q.order(o.column, { ascending: o.ascending ?? false });
        }
        const { data, error } = await q.limit(config.limit ?? 500);
        if (error) setLoadError(error.message);
        else {
            setRows((data ?? []) as Row[]);
            setLoadError("");
        }
        setLoading(false);
    }, [supabase, config, pk]);

    useEffect(() => {
        load();
    }, [load]);

    // Load dropdown choices for fields that point at another table.
    useEffect(() => {
        (async () => {
            const result: Record<string, Option[]> = {};
            for (const f of config.fields) {
                if (f.type !== "select" || !f.options) continue;
                const { table, value, label } = f.options;
                const { data } = await supabase.from(table).select(`${value}, ${label}`);
                result[f.key] = ((data ?? []) as unknown as Row[]).map((r) => ({
                    value: String(r[value]),
                    label: String(r[label] ?? r[value]),
                }));
            }
            setOptions(result);
        })();
    }, [supabase, config]);

    const canEdit = (f: ResourceField) => f.editable !== false;

    const shown = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter((r) =>
            config.fields.some((f) => {
                const v = r[f.key];
                const label = f.type === "select" ? options[f.key]?.find((o) => o.value === String(v))?.label : null;
                return String(label ?? v ?? "").toLowerCase().includes(term);
            })
        );
    }, [rows, query, config.fields, options]);

    function startCreate() {
        const d: Row = {};
        for (const f of config.fields) {
            if (!canEdit(f)) continue;
            if (f.type === "boolean") d[f.key] = f.defaultValue ?? true;
            else if (f.type === "select" && f.required) d[f.key] = options[f.key]?.[0]?.value ?? "";
            else d[f.key] = f.defaultValue ?? "";
        }
        setDraft(d);
        setEditing("new");
        setActionError("");
    }

    function startEdit(row: Row) {
        const d: Row = {};
        for (const f of config.fields) {
            if (canEdit(f)) d[f.key] = row[f.key] ?? (f.type === "boolean" ? false : "");
        }
        setDraft(d);
        setEditing(String(row[pk]));
        setActionError("");
    }

    function cancel() {
        setEditing(null);
        setDraft({});
        setActionError("");
    }

    // Turn the form's values into proper types; returns an error message if invalid.
    function buildPayload(): Row | string {
        const payload: Row = {};
        for (const f of config.fields) {
            if (!canEdit(f)) continue;
            let v = draft[f.key];

            if (f.type === "boolean") {
                v = Boolean(v);
            } else if (f.type === "number") {
                v = v === "" || v == null ? null : Number(v);
                if (typeof v === "number" && Number.isNaN(v)) return `${f.label} must be a number.`;
            } else if (f.type === "select") {
                v = v === "" || v == null ? null : /^\d+$/.test(String(v)) ? Number(v) : v;
            } else {
                v = typeof v === "string" ? v.trim() : v;
                if (f.lowercase && typeof v === "string") v = v.toLowerCase();
                if (v === "") v = null;
            }

            if (f.required && (v === null || v === undefined)) return `${f.label || "This field"} is required.`;
            payload[f.key] = v;
        }
        if (config.touchUpdatedAt) payload.updated_at = new Date().toISOString();
        return payload;
    }

    async function save() {
        const payload = buildPayload();
        if (typeof payload === "string") {
            setActionError(payload);
            return;
        }
        setBusy(true);
        setActionError("");
        const res =
            editing === "new"
                ? await supabase.from(config.table).insert(payload).select()
                : await supabase.from(config.table).update(payload).eq(pk, editing!).select();
        setBusy(false);

        // .select() confirms a row really changed; RLS silently blocks otherwise.
        if (res.error || !res.data?.length) {
            setActionError(res.error?.message ?? "Not permitted.");
            return;
        }
        cancel();
        load();
    }

    async function remove(row: Row) {
        if (!confirm(`Delete this ${config.singular}? This can't be undone.`)) return;
        setBusy(true);
        setActionError("");
        const { data, error } = await supabase.from(config.table).delete().eq(pk, String(row[pk])).select();
        setBusy(false);
        if (error || !data?.length) {
            setActionError(error?.message ?? "Not permitted.");
            return;
        }
        load();
    }

    function display(f: ResourceField, v: unknown) {
        if (v === null || v === undefined || v === "") return <span className="soft">n/a</span>;
        const s = String(v);
        switch (f.type) {
            case "boolean":
                return v ? <span className="badge badge-up">Yes</span> : <span className="badge">No</span>;
            case "select":
                return <span>{options[f.key]?.find((o) => o.value === s)?.label ?? s}</span>;
            case "datetime":
                return <span className="soft nowrap">{fmt.format(new Date(s))}</span>;
            case "url":
                return (
                    <a href={s} target="_blank" rel="noreferrer" className="row-link">
                        {s.replace(/^https?:\/\//, "")}
                    </a>
                );
            case "code":
                return <code className="model-code">{s}</code>;
            case "status": {
                const cls = s === "succeeded" ? "badge-up" : s === "failed" || s === "rejected" ? "badge-down" : "";
                return <span className={`badge ${cls}`}>{s}</span>;
            }
            case "textarea":
                return f.truncate && s.length > f.truncate ? (
                    <details className="prompt">
                        <summary>{s.slice(0, f.truncate)}…</summary>
                        <pre>{s}</pre>
                    </details>
                ) : (
                    <span className="cell-wrap">{s}</span>
                );
            default:
                return <span>{s}</span>;
        }
    }

    function input(f: ResourceField) {
        const v = draft[f.key];
        const set = (val: unknown) => setDraft((d) => ({ ...d, [f.key]: val }));
        switch (f.type) {
            case "boolean":
                return <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} />;
            case "textarea":
                return (
                    <textarea
                        className="input edit-area"
                        rows={3}
                        placeholder={f.placeholder}
                        value={String(v ?? "")}
                        onChange={(e) => set(e.target.value)}
                    />
                );
            case "number":
                return (
                    <input
                        type="number"
                        className="input input-sm"
                        value={String(v ?? "")}
                        onChange={(e) => set(e.target.value)}
                    />
                );
            case "select":
                return (
                    <select className="select" value={String(v ?? "")} onChange={(e) => set(e.target.value)}>
                        {!f.required && <option value="">None</option>}
                        {(options[f.key] ?? []).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                );
            default:
                return (
                    <input
                        className="input input-sm"
                        placeholder={f.placeholder}
                        value={String(v ?? "")}
                        onChange={(e) => set(e.target.value)}
                    />
                );
        }
    }

    const editButtons = (
        <>
            <button className="btn btn-sm btn-accent" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-sm" onClick={cancel} disabled={busy}>Cancel</button>
        </>
    );

    const permissions = [
        "Read",
        config.canCreate && "Create",
        config.canUpdate && "Update",
        config.canDelete && "Delete",
    ].filter(Boolean) as string[];

    return (
        <>
            <div className="page-head">
                <div>
                    <p className="eyebrow">{config.group}</p>
                    <h1 className="title">{config.title}</h1>
                    {config.description && <p className="muted" style={{ margin: 0 }}>{config.description}</p>}
                </div>
                <div className="access-tags">
                    {permissions.map((p) => (
                        <span key={p} className="badge badge-admin">{p}</span>
                    ))}
                </div>
            </div>

            <div className="toolbar">
                <input
                    className="input"
                    placeholder={`Search ${config.title.toLowerCase()}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {config.canCreate && (
                    <button className="btn btn-accent" onClick={startCreate} disabled={editing !== null}>
                        ＋ New {config.singular}
                    </button>
                )}
                <button className="btn" onClick={load}>↻ Refresh</button>
                <span className="soft small toolbar-count">{shown.length} of {rows.length}</span>
            </div>

            {actionError && <p className="error-text" style={{ marginBottom: 12 }}>{actionError}</p>}

            <div className="panel table-wrap">
                <table className="data">
                    <thead>
                    <tr>
                        {config.fields.map((f) => (
                            <th key={f.key}>{f.label}</th>
                        ))}
                        {hasActions && <th />}
                    </tr>
                    </thead>
                    <tbody>
                    {editing === "new" && (
                        <tr className="editing-row">
                            {config.fields.map((f) => (
                                <td key={f.key}>{canEdit(f) ? input(f) : <span className="soft">auto</span>}</td>
                            ))}
                            <td className="actions">{editButtons}</td>
                        </tr>
                    )}

                    {loading && (
                        <tr><td colSpan={99} className="empty-cell">Loading…</td></tr>
                    )}
                    {!loading && loadError && (
                        <tr><td colSpan={99} className="empty-cell error-text">{loadError}</td></tr>
                    )}
                    {!loading && !loadError && shown.length === 0 && (
                        <tr><td colSpan={99} className="empty-cell">Nothing here yet.</td></tr>
                    )}

                    {!loading &&
                        shown.map((row) => {
                            const id = String(row[pk]);
                            const isEditing = editing === id;
                            return (
                                <tr key={id} className={isEditing ? "editing-row" : ""}>
                                    {config.fields.map((f) => (
                                        <td key={f.key}>{isEditing && canEdit(f) ? input(f) : display(f, row[f.key])}</td>
                                    ))}
                                    {hasActions && (
                                        <td className="actions">
                                            {isEditing ? (
                                                editButtons
                                            ) : (
                                                <>
                                                    {config.canUpdate && (
                                                        <button className="btn btn-sm" onClick={() => startEdit(row)} disabled={editing !== null}>
                                                            Edit
                                                        </button>
                                                    )}
                                                    {config.canDelete && (
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => remove(row)}
                                                            disabled={busy || editing !== null}
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { VIBES, vibeLabel, type VibeKey } from "../../lib/vibes";

export type CaptionRowData = {
    id: number;
    caption: string;
    vibe: string;
    prompt: string;
    model: string;
    dateLabel: string;
    authorId: string;
    authorName: string;
    subjectLabel: string;
    image: string | null;
    up: number;
    down: number;
};

export default function CaptionRow({ row }: { row: CaptionRowData }) {
    const router = useRouter();
    const supabase = createClient();

    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(row.caption);
    const [vibe, setVibe] = useState(row.vibe);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function save() {
        if (!text.trim()) {
            setError("Caption can't be empty.");
            return;
        }
        setBusy(true);
        setError("");
        // .select() confirms a row actually changed (RLS would silently match nothing for non-admins).
        const { data, error } = await supabase
            .from("generations")
            .update({ caption: text.trim(), vibe })
            .eq("id", row.id)
            .select("id");
        setBusy(false);

        if (error || !data?.length) {
            setError(error?.message ?? "Not permitted.");
            return;
        }
        setEditing(false);
        router.refresh();
    }

    async function remove() {
        if (!confirm("Delete this caption and its votes? This can't be undone.")) return;
        setBusy(true);
        setError("");
        const { data, error } = await supabase
            .from("generations")
            .delete()
            .eq("id", row.id)
            .select("id");
        setBusy(false);

        if (error || !data?.length) {
            setError(error?.message ?? "Not permitted.");
            return;
        }
        router.refresh();
    }

    function cancel() {
        setText(row.caption);
        setVibe(row.vibe);
        setEditing(false);
        setError("");
    }

    return (
        <tr>
            <td className="thumb-cell">
                {row.image ? (
                    <a href={row.image} target="_blank" rel="noreferrer">
                        <img src={row.image} alt="" className="thumb" />
                    </a>
                ) : (
                    <span className="thumb thumb-empty">💬</span>
                )}
            </td>

            <td className="caption-cell">
                {editing ? (
                    <textarea
                        className="input edit-area"
                        rows={2}
                        maxLength={300}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                ) : (
                    <div className="caption-text">{row.caption}</div>
                )}
                <div className="soft cell-sub">{row.subjectLabel}</div>
                <details className="prompt">
                    <summary>View prompt</summary>
                    <pre>{row.prompt}</pre>
                </details>
            </td>

            <td>
                {editing ? (
                    <select className="select" value={vibe} onChange={(e) => setVibe(e.target.value)}>
                        {(Object.keys(VIBES) as VibeKey[]).map((k) => (
                            <option key={k} value={k}>{VIBES[k].emoji} {VIBES[k].label}</option>
                        ))}
                    </select>
                ) : (
                    <span className="badge">{vibeLabel(row.vibe)}</span>
                )}
            </td>

            <td>
                <a href={`/captions?user=${row.authorId}`} className="row-link">{row.authorName}</a>
            </td>

            <td className="num">
                <div className={`strong ${row.up - row.down > 0 ? "pos" : row.up - row.down < 0 ? "neg" : ""}`}>
                    {row.up - row.down}
                </div>
                <div className="cell-sub">
                    <span className="pos">▲{row.up}</span> <span className="neg">▼{row.down}</span>
                </div>
            </td>

            <td><code className="model-code">{row.model}</code></td>
            <td className="soft nowrap">{row.dateLabel}</td>

            <td className="actions">
                {editing ? (
                    <>
                        <button className="btn btn-sm btn-accent" onClick={save} disabled={busy}>Save</button>
                        <button className="btn btn-sm" onClick={cancel} disabled={busy}>Cancel</button>
                    </>
                ) : (
                    <>
                        <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>Delete</button>
                    </>
                )}
                {error && <div className="error-text">{error}</div>}
            </td>
        </tr>
    );
}
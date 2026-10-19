import { requireAdmin } from "../../lib/admin";
import { VIBES, type VibeKey } from "../../lib/vibes";
import NewCaptionForm from "../components/NewCaptionForm";
import CaptionRow, { type CaptionRowData } from "../components/CaptionRow";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Captions · NYC Spots Admin" };

const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

type Params = { q?: string; vibe?: string; type?: string; sort?: string; user?: string };

export default async function CaptionsPage({ searchParams }: { searchParams: Promise<Params> }) {
    const { q, vibe, type, sort, user: userFilter } = await searchParams;
    const { supabase } = await requireAdmin();

    const [{ data: gens }, { data: votes }, { data: profiles }, { data: spots }] = await Promise.all([
        supabase
            .from("generations")
            .select("id, caption, vibe, prompt, model, created_at, user_id, image_url, nyc_spots(name, image_url)")
            .order("created_at", { ascending: false }),
        supabase.from("votes").select("generation_id, value"), // admin RLS: all votes
        supabase.from("profiles").select("id, first_name, last_name"),
        supabase.from("nyc_spots").select("id, name").order("name"),
    ]);

    const tally = new Map<number, { up: number; down: number }>();
    for (const v of votes ?? []) {
        const t = tally.get(v.generation_id) ?? { up: 0, down: 0 };
        if (v.value > 0) t.up++;
        else t.down++;
        tally.set(v.generation_id, t);
    }

    const nameMap = new Map(
        (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed"])
    );

    let rows: CaptionRowData[] = (gens ?? []).map((g) => {
        const spot = (Array.isArray(g.nyc_spots) ? g.nyc_spots[0] : g.nyc_spots) as
            | { name: string; image_url: string | null }
            | null;
        const t = tally.get(g.id) ?? { up: 0, down: 0 };
        return {
            id: g.id,
            caption: g.caption,
            vibe: g.vibe,
            prompt: g.prompt,
            model: g.model,
            dateLabel: fmt.format(new Date(g.created_at)),
            authorId: g.user_id,
            authorName: nameMap.get(g.user_id) ?? "Unknown",
            subjectLabel: g.image_url ? "📸 User photo" : `📍 ${spot?.name ?? "Spot"}`,
            image: g.image_url ?? spot?.image_url ?? null,
            up: t.up,
            down: t.down,
        };
    });

    // ---- Filters ----
    const term = (q ?? "").trim().toLowerCase();
    if (term) rows = rows.filter((r) => r.caption.toLowerCase().includes(term));
    if (vibe && vibe in VIBES) rows = rows.filter((r) => r.vibe === vibe);
    if (type === "photo") rows = rows.filter((r) => r.subjectLabel.startsWith("📸"));
    if (type === "spot") rows = rows.filter((r) => r.subjectLabel.startsWith("📍"));
    if (userFilter) rows = rows.filter((r) => r.authorId === userFilter);

    // ---- Sorting ----
    const score = (r: CaptionRowData) => r.up - r.down;
    if (sort === "top") rows.sort((a, b) => score(b) - score(a));
    if (sort === "worst") rows.sort((a, b) => score(a) - score(b));
    if (sort === "controversial")
        rows.sort((a, b) => Math.min(b.up, b.down) - Math.min(a.up, a.down) || b.up + b.down - (a.up + a.down));

    const total = gens?.length ?? 0;
    const shown = rows.slice(0, 200);
    const anyFilter = !!(term || vibe || type || sort || userFilter);

    return (
        <>
            <div className="page-head">
                <div>
                    <p className="eyebrow">Captions</p>
                    <h1 className="title">AI-generated captions</h1>
                    <p className="muted" style={{ margin: 0 }}>Create, review, edit, and remove captions.</p>
                </div>
                <NewCaptionForm spots={spots ?? []} />
            </div>

            <form className="toolbar" action="/captions">
                {userFilter && <input type="hidden" name="user" value={userFilter} />}
                <input name="q" defaultValue={q ?? ""} placeholder="Search caption text…" className="input" />
                <select name="vibe" defaultValue={vibe ?? ""} className="select">
                    <option value="">Any vibe</option>
                    {(Object.keys(VIBES) as VibeKey[]).map((k) => (
                        <option key={k} value={k}>{VIBES[k].emoji} {VIBES[k].label}</option>
                    ))}
                </select>
                <select name="type" defaultValue={type ?? ""} className="select">
                    <option value="">Photos & spots</option>
                    <option value="photo">📸 User photos</option>
                    <option value="spot">📍 Spots</option>
                </select>
                <select name="sort" defaultValue={sort ?? ""} className="select">
                    <option value="">Newest first</option>
                    <option value="top">Highest score</option>
                    <option value="worst">Lowest score</option>
                    <option value="controversial">Most controversial</option>
                </select>
                <button className="btn" type="submit">Apply</button>
                {anyFilter && <a href="/captions" className="btn">Reset</a>}
                <span className="soft small toolbar-count">
          {rows.length} of {total} caption{total === 1 ? "" : "s"}
        </span>
            </form>

            {userFilter && (
                <p className="filter-note">
                    Showing captions by <strong>{nameMap.get(userFilter) ?? "this user"}</strong> ·{" "}
                    <a href="/captions" className="row-link">Show everyone</a>
                </p>
            )}

            <div className="panel table-wrap">
                <table className="data">
                    <thead>
                    <tr>
                        <th />
                        <th>Caption</th>
                        <th>Vibe</th>
                        <th>Author</th>
                        <th className="num">Score</th>
                        <th>Model</th>
                        <th>Created</th>
                        <th />
                    </tr>
                    </thead>
                    <tbody>
                    {shown.length === 0 && (
                        <tr>
                            <td colSpan={8} className="empty-cell">No captions match these filters.</td>
                        </tr>
                    )}
                    {shown.map((row) => (
                        <CaptionRow key={row.id} row={row} />
                    ))}
                    </tbody>
                </table>
            </div>
            {rows.length > shown.length && (
                <p className="soft small" style={{ marginTop: 10 }}>
                    Showing the first {shown.length}. Use filters to narrow it down.
                </p>
            )}
        </>
    );
}

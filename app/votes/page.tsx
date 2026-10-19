import type { Metadata } from "next";
import { requireAdmin } from "../../lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Votes · NYC Spots Admin" };

const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

type Params = { value?: string; voter?: string; q?: string };

export default async function VotesPage({ searchParams }: { searchParams: Promise<Params> }) {
    const { value, voter, q } = await searchParams;
    const { supabase } = await requireAdmin();

    const [{ data: votes }, { data: gens }, { data: profiles }] = await Promise.all([
        supabase
            .from("votes")
            .select("id, generation_id, user_id, value, created_at") // admin RLS: all votes
            .order("created_at", { ascending: false }),
        supabase.from("generations").select("id, caption, user_id, image_url, nyc_spots(image_url)"),
        supabase.from("profiles").select("id, first_name, last_name, avatar_url"),
    ]);

    const V = votes ?? [];
    const genMap = new Map((gens ?? []).map((g) => [g.id, g]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const nameOf = (id: string) => {
        const p = profileMap.get(id);
        return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Unnamed";
    };
    const imageOf = (genId: number) => {
        const g = genMap.get(genId);
        if (!g) return null;
        const spot = (Array.isArray(g.nyc_spots) ? g.nyc_spots[0] : g.nyc_spots) as { image_url: string | null } | null;
        return g.image_url ?? spot?.image_url ?? null;
    };

    // Summary (always across all votes)
    const ups = V.filter((v) => v.value > 0).length;
    const downs = V.length - ups;
    const uniqueVoters = new Set(V.map((v) => v.user_id)).size;

    // Filters
    const term = (q ?? "").trim().toLowerCase();
    let rows = V;
    if (value === "up") rows = rows.filter((v) => v.value > 0);
    if (value === "down") rows = rows.filter((v) => v.value < 0);
    if (voter) rows = rows.filter((v) => v.user_id === voter);
    if (term) rows = rows.filter((v) => genMap.get(v.generation_id)?.caption.toLowerCase().includes(term));
    const shown = rows.slice(0, 300);
    const anyFilter = !!(value || voter || term);

    // Voters for the dropdown, most active first
    const voterCounts = new Map<string, number>();
    for (const v of V) voterCounts.set(v.user_id, (voterCounts.get(v.user_id) ?? 0) + 1);
    const voterOptions = [...voterCounts.entries()].sort((a, b) => b[1] - a[1]);

    return (
        <>
            <p className="eyebrow">Votes</p>
            <h1 className="title">Votes</h1>
            <p className="muted" style={{ margin: 0 }}>Every upvote and downvote cast on NYC Spots.</p>

            <div className="stat-row stat-row-4">
                <div className="panel stat">
                    <div className="stat-value">{V.length}</div>
                    <div className="stat-label">Total votes</div>
                </div>
                <div className="panel stat">
                    <div className="stat-value">{ups}</div>
                    <div className="stat-label">▲ Upvotes</div>
                </div>
                <div className="panel stat">
                    <div className="stat-value">{downs}</div>
                    <div className="stat-label">▼ Downvotes</div>
                </div>
                <div className="panel stat">
                    <div className="stat-value">{uniqueVoters}</div>
                    <div className="stat-label">Unique voters</div>
                </div>
            </div>

            <form className="toolbar" action="/votes">
                <input name="q" defaultValue={q ?? ""} placeholder="Search caption text…" className="input" />
                <select name="value" defaultValue={value ?? ""} className="select">
                    <option value="">▲ and ▼</option>
                    <option value="up">▲ Upvotes only</option>
                    <option value="down">▼ Downvotes only</option>
                </select>
                <select name="voter" defaultValue={voter ?? ""} className="select">
                    <option value="">All voters</option>
                    {voterOptions.map(([id, n]) => (
                        <option key={id} value={id}>{nameOf(id)} ({n})</option>
                    ))}
                </select>
                <button className="btn" type="submit">Apply</button>
                {anyFilter && <a href="/votes" className="btn">Reset</a>}
                <span className="soft small toolbar-count">
          {rows.length} of {V.length} vote{V.length === 1 ? "" : "s"}
        </span>
            </form>

            <div className="panel table-wrap">
                <table className="data">
                    <thead>
                    <tr>
                        <th>Voter</th>
                        <th>Vote</th>
                        <th />
                        <th>Caption</th>
                        <th>Caption by</th>
                        <th>When</th>
                    </tr>
                    </thead>
                    <tbody>
                    {shown.length === 0 && (
                        <tr>
                            <td colSpan={6} className="empty-cell">No votes match these filters.</td>
                        </tr>
                    )}
                    {shown.map((v) => {
                        const g = genMap.get(v.generation_id);
                        const voterProfile = profileMap.get(v.user_id);
                        const img = imageOf(v.generation_id);
                        return (
                            <tr key={v.id}>
                                <td>
                                    <a href={`/votes?voter=${v.user_id}`} className="user-cell">
                                        {voterProfile?.avatar_url ? (
                                            <img src={voterProfile.avatar_url} alt="" referrerPolicy="no-referrer" />
                                        ) : (
                                            <span className="avatar-fallback">{nameOf(v.user_id)[0]}</span>
                                        )}
                                        <span className="strong">{nameOf(v.user_id)}</span>
                                    </a>
                                </td>
                                <td>
                    <span className={`badge ${v.value > 0 ? "badge-up" : "badge-down"}`}>
                      {v.value > 0 ? "▲ Up" : "▼ Down"}
                    </span>
                                </td>
                                <td className="thumb-cell">
                                    {img ? <img src={img} alt="" className="thumb thumb-sm" /> : <span className="thumb thumb-sm thumb-empty">💬</span>}
                                </td>
                                <td className="caption-cell">
                                    <div className="caption-text">{g?.caption ?? "(deleted caption)"}</div>
                                </td>
                                <td>
                                    {g ? (
                                        <a href={`/captions?user=${g.user_id}`} className="row-link">{nameOf(g.user_id)}</a>
                                    ) : (
                                        <span className="soft">n/a</span>
                                    )}
                                </td>
                                <td className="soft nowrap">{fmt.format(new Date(v.created_at))}</td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
            {rows.length > shown.length && (
                <p className="soft small" style={{ marginTop: 10 }}>
                    Showing the most recent {shown.length}. Use filters to narrow it down.
                </p>
            )}
        </>
    );
}
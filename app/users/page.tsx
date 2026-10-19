import { requireAdmin } from "../../lib/admin";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Users · NYC Spots Admin" };

export const dynamic = "force-dynamic";


type AdminUser = {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    is_superadmin: boolean;
    created_at: string;
    last_sign_in_at: string | null;
};

const fmtDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
});
const fmtDateTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

export default async function UsersPage({
                                            searchParams,
                                        }: {
    searchParams: Promise<{ q?: string }>;
}) {
    const { q } = await searchParams;
    const { supabase } = await requireAdmin();

    const [{ data, error }, { data: gens }, { data: votes }] = await Promise.all([
        supabase.rpc("admin_list_users"), // admin-only: includes emails & sign-in dates
        supabase.from("generations").select("id, user_id"),
        supabase.from("votes").select("generation_id, value, user_id"), // admin RLS: all votes
    ]);

    if (error) {
        return <div className="panel">Couldn&apos;t load users: {error.message}</div>;
    }

    const users = (data ?? []) as AdminUser[];

    // Per-user activity
    const ownerOf = new Map((gens ?? []).map((g) => [g.id, g.user_id]));
    const captionCount = new Map<string, number>();
    for (const g of gens ?? []) captionCount.set(g.user_id, (captionCount.get(g.user_id) ?? 0) + 1);

    const votesCast = new Map<string, number>();
    const points = new Map<string, number>();
    for (const v of votes ?? []) {
        votesCast.set(v.user_id, (votesCast.get(v.user_id) ?? 0) + 1);
        const owner = ownerOf.get(v.generation_id);
        if (owner) points.set(owner, (points.get(owner) ?? 0) + v.value);
    }

    // Summary
    const weekAgo = Date.now() - 7 * 86_400_000;
    const admins = users.filter((u) => u.is_superadmin).length;
    const activeThisWeek = users.filter(
        (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgo
    ).length;

    // Search
    const term = (q ?? "").trim().toLowerCase();
    const shown = term
        ? users.filter((u) =>
            [u.first_name, u.last_name, u.email].some((f) => f?.toLowerCase().includes(term))
        )
        : users;

    return (
        <>
            <p className="eyebrow">Users</p>
            <h1 className="title">Users</h1>
            <p className="muted" style={{ margin: 0 }}>Everyone who has signed in to NYC Spots.</p>

            <div className="stat-row stat-row-3">
                <div className="panel stat">
                    <div className="stat-value">{users.length}</div>
                    <div className="stat-label">Total users</div>
                </div>
                <div className="panel stat">
                    <div className="stat-value">{activeThisWeek}</div>
                    <div className="stat-label">Active this week</div>
                </div>
                <div className="panel stat">
                    <div className="stat-value">{admins}</div>
                    <div className="stat-label">Superadmins</div>
                </div>
            </div>

            <form className="toolbar" action="/users">
                <input
                    name="q"
                    defaultValue={q ?? ""}
                    placeholder="Search by name or email…"
                    className="input"
                />
                <button className="btn" type="submit">Search</button>
                {term && <a href="/users" className="btn">Clear</a>}
                <span className="soft small toolbar-count">
          {shown.length} of {users.length} user{users.length === 1 ? "" : "s"}
        </span>
            </form>

            <div className="panel table-wrap">
                <table className="data">
                    <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Last sign-in</th>
                        <th className="num">Captions</th>
                        <th className="num">Votes cast</th>
                        <th className="num">Points</th>
                        <th />
                    </tr>
                    </thead>
                    <tbody>
                    {shown.length === 0 && (
                        <tr>
                            <td colSpan={8} className="empty-cell">No users match &ldquo;{q}&rdquo;.</td>
                        </tr>
                    )}
                    {shown.map((u) => {
                        const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unnamed";
                        const pts = points.get(u.id) ?? 0;
                        return (
                            <tr key={u.id}>
                                <td>
                                    <div className="user-cell">
                                        {u.avatar_url ? (
                                            <img src={u.avatar_url} alt="" referrerPolicy="no-referrer" />
                                        ) : (
                                            <span className="avatar-fallback">{name[0]}</span>
                                        )}
                                        <div>
                                            <div className="strong">{name}</div>
                                            <div className="soft cell-sub">{u.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                    <span className={`badge${u.is_superadmin ? " badge-admin" : ""}`}>
                      {u.is_superadmin ? "Superadmin" : "User"}
                    </span>
                                </td>
                                <td className="soft">{fmtDate.format(new Date(u.created_at))}</td>
                                <td className="soft">
                                    {u.last_sign_in_at ? fmtDateTime.format(new Date(u.last_sign_in_at)) : "Never"}
                                </td>
                                <td className="num">{captionCount.get(u.id) ?? 0}</td>
                                <td className="num">{votesCast.get(u.id) ?? 0}</td>
                                <td className={`num strong ${pts > 0 ? "pos" : pts < 0 ? "neg" : ""}`}>{pts}</td>
                                <td className="num">
                                    <a href={`/captions?user=${u.id}`} className="row-link">Captions →</a>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </>
    );
}
import type { Metadata } from "next";
import { requireAdmin } from "../../lib/admin";
import ImagesManager, { type AdminImage } from "../components/ImagesManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Images · NYC Spots Admin" };

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export default async function ImagesPage() {
    const { supabase, user } = await requireAdmin();

    const [{ data: images }, { data: profiles }, { data: gens }] = await Promise.all([
        supabase.from("images").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, first_name"),
        supabase.from("generations").select("image_id").not("image_id", "is", null),
    ]);

    const names = new Map((profiles ?? []).map((p) => [p.id, p.first_name ?? "Unnamed"]));
    const counts = new Map<number, number>();
    for (const g of gens ?? []) counts.set(g.image_id, (counts.get(g.image_id) ?? 0) + 1);

    const rows: AdminImage[] = (images ?? []).map((img) => ({
        id: img.id,
        url: img.url,
        storage_path: img.storage_path,
        description: img.description,
        uploader: names.get(img.user_id) ?? "Unknown",
        dateLabel: fmt.format(new Date(img.created_at)),
        captionCount: counts.get(img.id) ?? 0,
    }));

    return (
        <>
            <div className="page-head">
                <div>
                    <p className="eyebrow">Content</p>
                    <h1 className="title">Images</h1>
                    <p className="muted" style={{ margin: 0 }}>Every photo uploaded to NYC Spots. Upload, describe, or remove.</p>
                </div>
                <div className="access-tags">
                    {["Read", "Create", "Update", "Delete"].map((p) => (
                        <span key={p} className="badge badge-admin">{p}</span>
                    ))}
                </div>
            </div>
            <ImagesManager images={rows} adminId={user.id} />
        </>
    );
}
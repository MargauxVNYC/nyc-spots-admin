"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export type AdminImage = {
    id: number;
    url: string;
    storage_path: string | null;
    description: string | null;
    uploader: string;
    dateLabel: string;
    captionCount: number;
};

// Shrink and convert to JPEG before uploading.
async function toJpeg(file: File, max = 1600): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process image."))), "image/jpeg", 0.85)
    );
}

export default function ImagesManager({ images, adminId }: { images: AdminImage[]; adminId: string }) {
    const router = useRouter();
    const supabase = createClient();
    const fileRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState("");
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState("");
    const [error, setError] = useState("");

    async function upload() {
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const jpeg = await toJpeg(file);
            const path = `${adminId}/admin-${Date.now()}.jpg`;
            const { error: upErr } = await supabase.storage.from("uploads").upload(path, jpeg, { contentType: "image/jpeg" });
            if (upErr) throw new Error(upErr.message);

            const url = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
            const { error: dbErr } = await supabase
                .from("images")
                .insert({ url, storage_path: path, description: description.trim() || null });
            if (dbErr) throw new Error(dbErr.message);

            setFile(null);
            setDescription("");
            if (fileRef.current) fileRef.current.value = "";
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed.");
        } finally {
            setUploading(false);
        }
    }

    async function saveDescription(id: number) {
        const { data, error } = await supabase
            .from("images")
            .update({ description: editText.trim() || null })
            .eq("id", id)
            .select("id");
        if (error || !data?.length) {
            setError(error?.message ?? "Not permitted.");
            return;
        }
        setEditingId(null);
        router.refresh();
    }

    async function remove(img: AdminImage) {
        const warning = img.captionCount
            ? `Delete this image AND its ${img.captionCount} caption(s)? This can't be undone.`
            : "Delete this image? This can't be undone.";
        if (!confirm(warning)) return;

        const { data, error } = await supabase.from("images").delete().eq("id", img.id).select("id");
        if (error || !data?.length) {
            setError(error?.message ?? "Not permitted.");
            return;
        }
        if (img.storage_path) await supabase.storage.from("uploads").remove([img.storage_path]);
        router.refresh();
    }

    return (
        <>
            <section className="panel upload-panel">
                <h2 className="panel-title">＋ Upload a new image</h2>
                <div className="upload-row">
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <input
                        className="input"
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <button className="btn btn-accent" onClick={upload} disabled={!file || uploading}>
                        {uploading ? "Uploading…" : "Upload"}
                    </button>
                </div>
                {error && <p className="error-text">{error}</p>}
            </section>

            <div className="image-grid">
                {images.length === 0 && <p className="soft">No images yet.</p>}
                {images.map((img) => (
                    <article key={img.id} className="panel image-card">
                        <a href={img.url} target="_blank" rel="noreferrer">
                            <img src={img.url} alt={img.description ?? ""} />
                        </a>
                        <div className="image-body">
                            {editingId === img.id ? (
                                <>
                  <textarea
                      className="input edit-area"
                      rows={2}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                  />
                                    <div className="form-actions">
                                        <button className="btn btn-sm btn-accent" onClick={() => saveDescription(img.id)}>Save</button>
                                        <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                                    </div>
                                </>
                            ) : (
                                <p className={img.description ? "" : "soft"} style={{ margin: 0 }}>
                                    {img.description ?? "No description"}
                                </p>
                            )}
                            <p className="soft cell-sub">
                                #{img.id} · {img.uploader} · {img.dateLabel} · {img.captionCount} caption
                                {img.captionCount === 1 ? "" : "s"}
                            </p>
                            {editingId !== img.id && (
                                <div className="form-actions">
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => {
                                            setEditingId(img.id);
                                            setEditText(img.description ?? "");
                                        }}
                                    >
                                        Edit
                                    </button>
                                    <button className="btn btn-sm btn-danger" onClick={() => remove(img)}>Delete</button>
                                </div>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </>
    );
}
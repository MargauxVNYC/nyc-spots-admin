import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { VIBES, type VibeKey } from "../../../lib/vibes";

export const maxDuration = 60;

const PRIMARY = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const MODELS = [...new Set([PRIMARY, "gemini-flash-latest", "gemini-3.1-flash-lite"])];

async function loadImage(url: string) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": "NYCSpots/1.0 (class project)" } });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 8 * 1024 * 1024) return null;
        return { mimeType: type.split(";")[0], data: buf.toString("base64") };
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();

    // Admins only
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const { data: profile } = await supabase
        .from("profiles")
        .select("is_superadmin")
        .eq("id", user.id)
        .single();
    if (!profile?.is_superadmin) {
        return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const spotId = Number(body?.spotId);
    const vibe = body?.vibe as VibeKey;
    if (!spotId || !vibe || !(vibe in VIBES)) {
        return NextResponse.json({ error: "Pick a spot and a vibe." }, { status: 400 });
    }

    const { data: spot } = await supabase
        .from("nyc_spots")
        .select("name, neighborhood, category, notes, image_url")
        .eq("id", spotId)
        .single();
    if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });

    const image = spot.image_url ? await loadImage(spot.image_url) : null;

    const prompt = [
        "You write short, funny captions for photos.",
        "The audience is Columbia College students who are very online and still discovering New York City.",
        `The place: ${spot.name} (${spot.neighborhood ?? "NYC"}, ${spot.category ?? "spot"}).`,
        `Details: ${spot.notes ?? "none"}.`,
        image
            ? "A photo of it is attached. The caption must point to something specific you can see in it."
            : "The caption must reference a specific detail about this place.",
        "Never identify real people or comment on anyone's looks or body. Playful, never mean or offensive.",
        `Write in the voice of ${VIBES[vibe].voice}.`,
        "Write 1 caption, under 20 words, no hashtags, no quotation marks, at most one emoji.",
        "Return only the caption text.",
    ].join("\n");

    const parts = [...(image ? [{ inlineData: image }] : []), { text: prompt }];

    // Try each model, retrying briefly if Google is overloaded.
    for (const model of MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": process.env.GEMINI_API_KEY!,
                    },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts }],
                        generationConfig: { temperature: 1.1, maxOutputTokens: 1024 },
                    }),
                }
            );

            if (res.ok) {
                const data = await res.json();
                const caption = (data.candidates?.[0]?.content?.parts ?? [])
                    .map((p: { text?: string }) => p.text ?? "")
                    .join("")
                    .trim()
                    .replace(/^["“]|["”]$/g, "");
                if (caption) return NextResponse.json({ caption, prompt, model });
                break;
            }

            console.error(`Gemini error (${model}, attempt ${attempt})`, res.status, await res.text());
            if (res.status === 404) break;
            if (![429, 500, 503].includes(res.status)) break;
            if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
    }

    return NextResponse.json(
        { error: "The AI is busy right now. Try again in a moment, or write one yourself." },
        { status: 503 }
    );
}
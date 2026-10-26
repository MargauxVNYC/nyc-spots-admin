import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../lib/admin";
import { RESOURCES } from "../../../lib/resources";
import ResourceManager from "../../components/ResourceManager";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ resource: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { resource } = await params;
    return { title: `${RESOURCES[resource]?.title ?? "Not found"} · NYC Spots Admin` };
}

export default async function ManagePage({ params }: Props) {
    const { resource } = await params;
    await requireAdmin();

    const config = RESOURCES[resource];
    if (!config) notFound();

    return <ResourceManager key={resource} config={config} />;
}
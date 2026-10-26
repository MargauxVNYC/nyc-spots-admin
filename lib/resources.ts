export type FieldType =
    | "text" | "textarea" | "number" | "boolean" | "select"
    | "datetime" | "url" | "code" | "status";

export type ResourceField = {
    key: string;
    label: string;
    type?: FieldType;
    editable?: boolean;          // false = shown but never edited (ids, timestamps)
    required?: boolean;
    lowercase?: boolean;         // force lowercase on save (domains, emails)
    placeholder?: string;
    truncate?: number;           // long text collapses after N characters
    defaultValue?: string | number | boolean;
    options?: { table: string; value: string; label: string }; // dropdown from another table
};

export type ResourceConfig = {
    table: string;
    title: string;
    singular: string;
    group: string;
    description?: string;
    primaryKey?: string;
    fields: ResourceField[];
    orderBy?: { column: string; ascending?: boolean }[];
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
    touchUpdatedAt?: boolean;
    limit?: number;
};

const created: ResourceField = { key: "created_at", label: "Created", type: "datetime", editable: false };
const chainSelect = { table: "prompt_chains", value: "id", label: "name" };

export const RESOURCES: Record<string, ResourceConfig> = {
    // ---------- AI pipeline ----------
    "prompt-chains": {
        table: "prompt_chains",
        title: "Prompt chains",
        singular: "chain",
        group: "AI pipeline",
        description: "Each vibe is a prompt chain: an ordered set of steps assembled into the AI prompt.",
        orderBy: [{ column: "id", ascending: true }],
        fields: [
            { key: "id", label: "ID", editable: false },
            { key: "emoji", label: "", editable: false },
            { key: "name", label: "Name", editable: false },
            { key: "slug", label: "Slug", type: "code", editable: false },
            { key: "description", label: "Description", editable: false },
            created,
        ],
    },
    "chain-steps": {
        table: "prompt_chain_steps",
        title: "Prompt chain steps",
        singular: "step",
        group: "AI pipeline",
        description: "The instructions for each chain, in the order they're combined into the prompt.",
        orderBy: [{ column: "chain_id", ascending: true }, { column: "step_order", ascending: true }],
        fields: [
            { key: "chain_id", label: "Chain", type: "select", options: chainSelect, editable: false },
            { key: "step_order", label: "Order", type: "number", editable: false },
            { key: "name", label: "Step", editable: false },
            { key: "instructions", label: "Instructions", type: "textarea", truncate: 110, editable: false },
        ],
    },
    "chain-mix": {
        table: "prompt_chain_mix",
        title: "Prompt chain mix",
        singular: "mix entry",
        group: "AI pipeline",
        description: "Turn vibes on or off in NYC Spots and set their weight (higher = listed first).",
        primaryKey: "chain_id",
        canUpdate: true,
        touchUpdatedAt: true,
        orderBy: [{ column: "weight", ascending: false }],
        fields: [
            { key: "chain_id", label: "Chain", type: "select", options: chainSelect, editable: false },
            { key: "is_enabled", label: "Enabled", type: "boolean" },
            { key: "weight", label: "Weight", type: "number", required: true },
            { key: "updated_at", label: "Updated", type: "datetime", editable: false },
        ],
    },
    terms: {
        table: "terms",
        title: "Terms",
        singular: "term",
        group: "AI pipeline",
        description: "NYC & campus glossary fed into every prompt so captions sound local.",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        orderBy: [{ column: "term", ascending: true }],
        fields: [
            { key: "term", label: "Term", required: true, placeholder: "e.g. bodega" },
            { key: "definition", label: "Definition", type: "textarea", required: true },
            created,
        ],
    },
    examples: {
        table: "generation_examples",
        title: "AI generation examples",
        singular: "example",
        group: "AI pipeline",
        description: "Scene → caption pairs the AI imitates (few-shot examples).",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        fields: [
            { key: "chain_id", label: "Chain (optional)", type: "select", options: chainSelect },
            { key: "scene", label: "Scene", type: "textarea", required: true, placeholder: "What's in the photo" },
            { key: "caption", label: "Caption", type: "textarea", required: true },
            created,
        ],
    },

    // ---------- Observability ----------
    "generation-requests": {
        table: "generation_requests",
        title: "Generation requests",
        singular: "request",
        group: "Observability",
        description: "Every time someone clicks Generate in NYC Spots.",
        orderBy: [{ column: "created_at", ascending: false }],
        fields: [
            { key: "id", label: "ID", editable: false },
            { key: "created_at", label: "When", type: "datetime", editable: false },
            { key: "user_id", label: "User", type: "select", options: { table: "profiles", value: "id", label: "first_name" }, editable: false },
            { key: "chain_id", label: "Chain", type: "select", options: chainSelect, editable: false },
            { key: "spot_id", label: "Spot", type: "select", options: { table: "nyc_spots", value: "id", label: "name" }, editable: false },
            { key: "image_id", label: "Image", editable: false },
            { key: "status", label: "Status", type: "status", editable: false },
            { key: "error", label: "Error", type: "textarea", truncate: 60, editable: false },
        ],
    },
    "llm-responses": {
        table: "llm_responses",
        title: "LLM responses",
        singular: "response",
        group: "Observability",
        description: "Every individual AI call: the safety check and the caption writing.",
        orderBy: [{ column: "created_at", ascending: false }],
        fields: [
            { key: "id", label: "ID", editable: false },
            { key: "created_at", label: "When", type: "datetime", editable: false },
            { key: "request_id", label: "Request", editable: false },
            { key: "step", label: "Step", type: "code", editable: false },
            { key: "model", label: "Model", type: "code", editable: false },
            { key: "status_code", label: "HTTP", editable: false },
            { key: "latency_ms", label: "ms", editable: false },
            { key: "response_text", label: "Response", type: "textarea", truncate: 90, editable: false },
        ],
    },

    // ---------- Models ----------
    "llm-models": {
        table: "llm_models",
        title: "LLM models",
        singular: "model",
        group: "Models",
        description: "Models NYC Spots tries, in priority order (lowest number first). Inactive ones are skipped.",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        orderBy: [{ column: "priority", ascending: true }],
        fields: [
            { key: "provider_id", label: "Provider", type: "select", required: true, options: { table: "llm_providers", value: "id", label: "name" } },
            { key: "name", label: "Name", required: true, placeholder: "Gemini 3.5 Flash" },
            { key: "api_model_id", label: "API model ID", type: "code", required: true, placeholder: "gemini-3.5-flash" },
            { key: "is_active", label: "Active", type: "boolean", defaultValue: true },
            { key: "priority", label: "Priority", type: "number", required: true, defaultValue: 100 },
            created,
        ],
    },
    "llm-providers": {
        table: "llm_providers",
        title: "LLM providers",
        singular: "provider",
        group: "Models",
        description: "Companies whose models we call.",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        orderBy: [{ column: "name", ascending: true }],
        fields: [
            { key: "name", label: "Name", required: true },
            { key: "base_url", label: "Base URL", type: "url" },
            { key: "notes", label: "Notes", type: "textarea" },
            created,
        ],
    },

    // ---------- Access ----------
    "signup-domains": {
        table: "allowed_signup_domains",
        title: "Allowed signup domains",
        singular: "domain",
        group: "Access",
        description: "Anyone with an email at these domains can sign in to NYC Spots.",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        orderBy: [{ column: "domain", ascending: true }],
        fields: [
            { key: "domain", label: "Domain", required: true, lowercase: true, placeholder: "columbia.edu" },
            created,
        ],
    },
    "whitelisted-emails": {
        table: "whitelisted_emails",
        title: "Whitelisted emails",
        singular: "email",
        group: "Access",
        description: "Specific people allowed in even if their domain isn't on the list.",
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        orderBy: [{ column: "email", ascending: true }],
        fields: [
            { key: "email", label: "Email", required: true, lowercase: true, placeholder: "name@gmail.com" },
            { key: "note", label: "Note", placeholder: "e.g. TA" },
            created,
        ],
    },
};
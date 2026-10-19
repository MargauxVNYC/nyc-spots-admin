"use client";

import { usePathname } from "next/navigation";

const links = [
    { href: "/", label: "Overview", icon: "📊" },
    { href: "/users", label: "Users", icon: "👥" },
    { href: "/captions", label: "Captions", icon: "💬" },
    { href: "/votes", label: "Votes", icon: "🗳️" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar">
            <a href="/" className="brand">
                <span className="brand-mark">NYC</span>
                <span>
          Spots <span className="admin-badge">Admin</span>
        </span>
            </a>

            <nav className="side-nav">
                {links.map((link) => {
                    const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                    return (
                        <a key={link.href} href={link.href} className={`side-link${active ? " active" : ""}`}>
                            <span>{link.icon}</span>
                            {link.label}
                        </a>
                    );
                })}
            </nav>

            <a
                href="https://nextjs-app-chi-blue.vercel.app"
                target="_blank"
                rel="noreferrer"
                className="side-footer"
            >
                ↗ Open NYC Spots
            </a>
        </aside>
    );
}
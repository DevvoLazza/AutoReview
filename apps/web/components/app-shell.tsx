"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "./auth-gate";
import { Icon } from "./icons";

const navigation = [
  { href: "/", label: "Panoramica", icon: "home" },
  { href: "/inbox", label: "Recensioni", icon: "inbox" },
  { href: "/knowledge", label: "Memoria AI", icon: "brain" },
  { href: "/rules", label: "Automazioni", icon: "bolt" },
  { href: "/settings", label: "Impostazioni", icon: "settings" },
  { href: "/audit", label: "Registro attività", icon: "shield" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="ReviewGuard home">
          <span className="brand-mark">
            <Icon name="shield" />
          </span>
          <span>
            Review<span>Guard</span>
          </span>
        </Link>
        <div className="workspace-card">
          <div className="workspace-logo">DL</div>
          <div>
            <strong>{session?.demo ? "Ambiente dimostrativo" : "La tua attività"}</strong>
            <span>
              {session?.demo ? "Nessun invio reale a Google" : "Approvazione controllata"}
            </span>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <nav aria-label="Navigazione principale">
          {navigation.map((item) => (
            <Link
              className={pathname === item.href ? "nav-item active" : "nav-item"}
              href={item.href}
              key={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-status">
            <span className="pulse" />
            <div>
              <strong>Protezione attiva</strong>
              <small>Hard stop e audit abilitati</small>
            </div>
          </div>
          <div className="profile-row">
            <div className="avatar">DV</div>
            <div>
              <strong>{session?.principal.role ?? "Account"}</strong>
              <span>
                {session?.demo
                  ? "Sessione demo"
                  : session?.principal.mfaVerified
                    ? "MFA verificata"
                    : "MFA da completare"}
              </span>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                await fetch("/api/session", { method: "DELETE" });
                router.replace("/login");
                router.refresh();
              }}
            >
              Esci
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="Navigazione mobile">
        {navigation.slice(0, 4).map((item) => (
          <Link href={item.href} key={item.label}>
            <Icon name={item.icon} />
            <span>{item.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

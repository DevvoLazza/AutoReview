import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

const navigation = [
  { href: "/", label: "Panoramica", icon: "home" },
  { href: "/#inbox", label: "Recensioni", icon: "inbox", badge: "3" },
  { href: "/knowledge", label: "Memoria AI", icon: "brain" },
  { href: "/rules", label: "Automazioni", icon: "bolt" },
  { href: "/settings", label: "Impostazioni", icon: "settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
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
            <strong>Demo Location</strong>
            <span>Milano · 1 sede</span>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <nav aria-label="Navigazione principale">
          {navigation.map((item, index) => (
            <Link
              className={index === 0 ? "nav-item active" : "nav-item"}
              href={item.href}
              key={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge}</em> : null}
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
              <strong>Demo Owner</strong>
              <span>Owner · MFA attiva</span>
            </div>
            <span>•••</span>
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

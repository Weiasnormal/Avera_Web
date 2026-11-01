"use client";

import {
  BarChart3,
  Building2,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Microscope,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { resetUserState } from "@/components/providers/session-provider";
import { Skeleton } from "@/components/ui/spinner";
import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { useAdminStore } from "@/stores/admin";
import { useSessionStore } from "@/stores/session";

import { NotificationBell } from "./notification-bell";
import { NewAnalysisButton } from "./new-analysis-button";
import { ProfileMenu } from "./profile-menu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
}

function useNavItems(role: "user" | "admin"): NavItem[] {
  const pendingCount = useAdminStore((state) => state.pending.length);
  if (role === "admin") {
    return [
      { href: routes.admin.dashboard, label: "Overview", icon: LayoutDashboard, exact: true },
      { href: routes.admin.cases, label: "Cases", icon: FolderOpen },
      { href: routes.admin.team, label: "Team", icon: Users, badge: pendingCount },
      { href: routes.admin.stats, label: "Statistics", icon: BarChart3 },
      { href: routes.admin.organization, label: "Organization", icon: Building2 },
    ];
  }
  return [
    { href: routes.examiner.dashboard, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: routes.examiner.cases, label: "Cases", icon: FolderOpen },
    { href: routes.examiner.examinations, label: "Examination", icon: Microscope },
    { href: routes.examiner.stats, label: "Statistics", icon: BarChart3 },
  ];
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors duration-150",
        active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface/70 hover:text-ink",
      )}
    >
      <Icon className={cn("size-4.25", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white tabular">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Logo, product name and the signed-in organization underneath, so users always
 * see which organization's workspace they are in (sidebar on desktop, header on phones).
 */
function Brand({ compact }: { compact?: boolean }) {
  const loaded = useSessionStore((state) => state.profile !== null);
  const organization = useSessionStore((state) => state.profile?.organization ?? "");
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Image
        src="/brand/avera-icon.png"
        alt=""
        width={compact ? 28 : 32}
        height={compact ? 28 : 32}
        className={cn("shrink-0", compact ? "rounded-[7px]" : "rounded-lg")}
        priority={!compact}
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("leading-tight font-bold tracking-[-0.01em] text-ink", compact ? "text-[15px]" : "text-[16px]")}>Avera</span>
        {/* Fixed height so nothing shifts when the profile arrives. */}
        <span className="flex h-4 items-center">
          {loaded ? (
            <span className="truncate text-[12px] font-medium text-ink-3" title={organization}>
              {organization || "No organization"}
            </span>
          ) : (
            <Skeleton className="h-2.5 w-24" />
          )}
        </span>
      </span>
    </span>
  );
}

export function AppShell({ role, children }: { role: "user" | "admin"; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useNavItems(role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = usePresence(drawerOpen, 200);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const profileHref = role === "admin" ? routes.admin.profile : routes.examiner.profile;
  const helpHref = role === "admin" ? routes.admin.help : routes.examiner.help;

  useEffect(() => {
    if (role === "admin") void useAdminStore.getState().loadTeam();
  }, [role]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const signOut = async () => {
    setSigningOut(true);
    await useSessionStore.getState().signOut();
    resetUserState();
    router.replace(routes.signIn);
  };

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center pr-12 pl-5 lg:pr-5">
        <Brand />
      </div>

      {role === "user" ? (
        <div className="px-3 pb-4 pt-1">
          <NewAnalysisButton variant="card" size="sm" onNavigate={onNavigate} />
        </div>
      ) : null}

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>

    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-62 border-r border-line bg-rail lg:block">{sidebar()}</aside>

      {drawer.mounted ? (
        <div className={cn("fixed inset-0 z-40 lg:hidden", drawer.closing && "pointer-events-none")}>
          <button
            type="button"
            aria-label="Close menu"
            className={cn("absolute inset-0 bg-ink/40", drawer.closing ? "animate-fade-out" : "animate-fade-in")}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 w-70 max-w-[85vw] border-r border-line bg-rail shadow-pop",
              drawer.closing ? "animate-drawer-out" : "animate-drawer-in",
            )}
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-sunken"
            >
              <X className="size-4" />
            </button>
            {sidebar(() => setDrawerOpen(false))}
          </aside>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="pressable -ml-1 flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-sunken lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Link href={role === "admin" ? routes.admin.dashboard : routes.examiner.dashboard} className="min-w-0 flex-1 lg:hidden">
          <Brand compact />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <NotificationBell />
          <ProfileMenu role={role} profileHref={profileHref} helpHref={helpHref} onSignOut={() => setConfirmSignOut(true)} />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>

      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOut}
        loading={signingOut}
        title="Sign out of Avera?"
        description="You will need to sign in again to access your cases."
        confirmLabel="Sign out"
      />
    </div>
  );
}

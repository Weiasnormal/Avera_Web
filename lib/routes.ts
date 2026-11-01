export type AppRole = "user" | "admin";

export function homePathFor(role: AppRole) {
  return role === "admin" ? "/admin" : "/dashboard";
}

// Signed in but not yet part of an organization: examiners join with an invite
// code, admins create their organization (mobile: User&AdminCodepage / OrganizationCreate).
export function onboardingPathFor(role: AppRole) {
  return role === "admin" ? "/organization/new" : "/join";
}

export const routes = {
  signIn: "/sign-in",
  signUp: "/sign-up",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  examiner: {
    dashboard: "/dashboard",
    cases: "/cases",
    caseResult: (caseId: string) => `/cases/${encodeURIComponent(caseId)}`,
    examinations: "/examinations",
    examination: (examinationId: string) => `/examinations/${encodeURIComponent(examinationId)}`,
    stats: "/stats",
    newAnalysis: "/analysis/new",
    processing: (caseId: string) => `/analysis/${encodeURIComponent(caseId)}/processing`,
    profile: "/profile",
    help: "/help",
  },
  admin: {
    dashboard: "/admin",
    cases: "/admin/cases",
    caseReview: (caseId: string) => `/admin/cases/${encodeURIComponent(caseId)}`,
    team: "/admin/team",
    member: (memberId: string) => `/admin/team/${encodeURIComponent(memberId)}`,
    stats: "/admin/stats",
    organization: "/admin/organization",
    profile: "/admin/profile",
    help: "/admin/help",
  },
} as const;

// Only allow same-site relative redirects from ?next=.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

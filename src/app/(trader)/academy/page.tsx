"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  FilterChipRow,
  GhostButton,
  Panel,
  StatusPill,
  WorkspacePage,
} from "@/components/app/WorkspaceUI";
import { useState } from "react";
import { BookOpenCheck, CheckCircle2, Users } from "lucide-react";
import { BillingCheckoutModal } from "@/components/app/BillingCheckoutModal";
import type { AcademyCourseDto, CourseProgressDto } from "@/lib/domain/types";
import type { UserBillingSummaryDto } from "@/lib/services/billingService";

const MENTORSHIP_PRODUCT = {
  code: "MENTORSHIP_1_1",
  name: "1-to-1 Professional Mentorship",
  amount: 2500,
  currency: "EUR",
  billingInterval: "ONE_TIME",
  description:
    "You will be mentored directly by a professional trader in a private 1-on-1 mentorship program. After payment, an admin will contact you to schedule your sessions.",
};

type CourseWithProgress = AcademyCourseDto & { progress: CourseProgressDto };

const DIFFICULTY_TONE: Record<string, "lime" | "accent" | "danger" | "muted"> = {
  BEGINNER: "lime",
  INTERMEDIATE: "accent",
  ADVANCED: "danger",
};

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

export default function AcademyPage() {
  const [filter, setFilter] = useState<"ALL" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED">("ALL");
  const [mentorshipModalOpen, setMentorshipModalOpen] = useState(false);

  const { data: courses = [], isLoading, isError, error } = useQuery<CourseWithProgress[]>({
    queryKey: ["academy-courses"],
    queryFn: () => apiFetch("/api/academy/courses"),
  });

  const { data: billingSummary } = useQuery<UserBillingSummaryDto>({
    queryKey: ["billing-me"],
    queryFn: () => apiFetch("/api/billing/me"),
    staleTime: 60_000,
  });

  const mentorshipOrder = billingSummary?.paymentHistory.find(
    (h) => h.productCode === "MENTORSHIP_1_1" && ["PAID", "PENDING"].includes(h.status)
  );
  const mentorshipState: "NONE" | "PENDING_PAYMENT" | "PENDING_APPROVAL" =
    mentorshipOrder?.status === "PAID"
      ? "PENDING_APPROVAL"
      : mentorshipOrder?.status === "PENDING"
        ? "PENDING_PAYMENT"
        : "NONE";

  const filtered =
    filter === "ALL" ? courses : courses.filter((c) => c.difficulty === filter);

  // Find resume card: course with progress but not 100%
  const resumeCourse = courses.find(
    (c) => c.progress.progressPercent > 0 && c.progress.progressPercent < 100
  );

  return (
    <WorkspacePage
      eyebrow="Learning Center"
      title="Trading Academy"
      description="Master trading with structured courses, live webinars, and expert guidance"
      action={
        <Link href="/academy/webinars" className="btn-dark">
          <BookOpenCheck className="mr-2 inline-block h-4 w-4" />
          Live Webinars
        </Link>
      }
    >
      {/* Resume banner */}
      {resumeCourse ? (
        <Panel className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Continue learning
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">{resumeCourse.title}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-panel-strong">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${resumeCourse.progress.progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-muted">{resumeCourse.progress.progressPercent}%</span>
            </div>
          </div>
          <Link
            href={
              resumeCourse.progress.lastLessonSlug && resumeCourse.progress.lastCourseSlug
                ? `/academy/${resumeCourse.progress.lastCourseSlug}/lessons/${resumeCourse.progress.lastLessonSlug}`
                : `/academy/${resumeCourse.slug}`
            }
            className="btn-dark btn-active"
          >
            Resume
          </Link>
        </Panel>
      ) : null}

      <FilterChipRow
        chips={[
          { label: "All", active: filter === "ALL", onClick: () => setFilter("ALL") },
          { label: "Beginner", active: filter === "BEGINNER", onClick: () => setFilter("BEGINNER") },
          { label: "Intermediate", active: filter === "INTERMEDIATE", onClick: () => setFilter("INTERMEDIATE") },
          { label: "Advanced", active: filter === "ADVANCED", onClick: () => setFilter("ADVANCED") },
        ]}
      />

      {isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-52 animate-pulse rounded-3xl bg-panel" />)}
        </div>
      ) : isError ? (
        <Panel className="mt-4">
          <p className="text-sm text-danger">{error instanceof Error ? error.message : "Failed to load courses."}</p>
        </Panel>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No courses available"
          description="Check back soon — new courses are added regularly."
          icon={BookOpenCheck}
        />
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <Link
              key={course.id}
              href={`/academy/${course.slug}`}
              className="group flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5 transition-colors hover:border-accent/40 hover:bg-panel/80"
            >
              {course.coverImageUrl ? (
                <img src={course.coverImageUrl} alt={course.title} className="h-32 w-full rounded-xl object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-xl bg-panel-strong">
                  <BookOpenCheck className="h-10 w-10 text-muted/40" />
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground group-hover:text-accent leading-snug">
                  {course.title}
                </h3>
                {course.difficulty ? (
                  <StatusPill tone={DIFFICULTY_TONE[course.difficulty] ?? "muted"}>
                    {course.difficulty}
                  </StatusPill>
                ) : null}
              </div>
              {course.shortDescription ? (
                <p className="text-sm text-muted line-clamp-2 leading-5">{course.shortDescription}</p>
              ) : null}
              <div className="mt-auto space-y-2">
                {course.progress.progressPercent > 0 ? (
                  <div className="flex items-center gap-2">
                    {course.progress.progressPercent === 100 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-2" />
                    ) : null}
                    <div className="flex-1 h-1 overflow-hidden rounded-full bg-panel-strong">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${course.progress.progressPercent}%` }} />
                    </div>
                    <span className="text-[11px] text-muted shrink-0">{course.progress.progressPercent}%</span>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>{course.moduleCount} module{course.moduleCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{course.lessonCount} lesson{course.lessonCount !== 1 ? "s" : ""}</span>
                  {course.estimatedMinutes ? (
                    <>
                      <span>·</span>
                      <span>{Math.round(course.estimatedMinutes / 60)}h {course.estimatedMinutes % 60}m</span>
                    </>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 1-to-1 Mentorship CTA */}
      <div className="mt-6 rounded-3xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/15">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                1-to-1 Professional Mentorship
              </h3>
              <p className="mt-1 max-w-lg text-sm text-muted">
                Get mentored directly by a professional trader in a private 1-on-1 programme.
                Learn advanced strategies, risk management, and live market analysis tailored to your goals.
              </p>
              <p className="mt-2 text-sm font-semibold text-accent">€2,500 — one-time</p>
            </div>
          </div>

          <div className="shrink-0">
            {mentorshipState === "PENDING_APPROVAL" ? (
              <StatusPill tone="accent">Payment received — pending admin approval</StatusPill>
            ) : mentorshipState === "PENDING_PAYMENT" ? (
              <StatusPill tone="muted">Payment pending</StatusPill>
            ) : (
              <GhostButton type="button" onClick={() => setMentorshipModalOpen(true)}>
                Pay €2,500
              </GhostButton>
            )}
          </div>
        </div>
      </div>

      <BillingCheckoutModal
        open={mentorshipModalOpen}
        onClose={() => setMentorshipModalOpen(false)}
        product={MENTORSHIP_PRODUCT}
      />
    </WorkspacePage>
  );
}

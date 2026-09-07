import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Heart,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import ScrollReveal from "./scroll-reveal";

interface FeatureCard {
  title: string;
  description: string;
  icon: typeof ClipboardCheck;
  href: string;
}

const features: FeatureCard[] = [
  {
    title: "Attendance",
    description:
      "Capture registers quickly and keep attendance visible across teams",
    icon: ClipboardCheck,
    href: "/features/attendance",
  },
  {
    title: "Teams & Scheduling",
    description:
      "Coordinate staffing, classes, and sessions from one shared plan",
    icon: CalendarClock,
    href: "/features/teams-scheduling",
  },
  {
    title: "Family Communication",
    description:
      "Keep families informed with updates tied to real operational context",
    icon: MessageCircle,
    href: "/features/family-communication",
  },
  {
    title: "Safeguarding",
    description:
      "Support secure care workflows with role-based access and audit trails",
    icon: ShieldCheck,
    href: "/features/safeguarding",
  },
  {
    title: "Reporting",
    description:
      "Turn day-to-day activity into clear visibility for better decisions",
    icon: BarChart3,
    href: "/features/reporting",
  },
];

const roles = [
  {
    title: "Leaders",
    description:
      "Get a clear operational picture across attendance, staffing, communication, and care without manual reporting cycles.",
    icon: BarChart3,
  },
  {
    title: "Staff & team leaders",
    description:
      "Work from one connected flow for sessions, updates, and follow-up so less time is spent coordinating across tools.",
    icon: Users,
  },
  {
    title: "Parents & families",
    description:
      "Receive clearer communication and more consistent updates because teams are working from shared operational context.",
    icon: Heart,
  },
];

export default function FeatureCards() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <ScrollReveal className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
          Core capabilities
        </span>
        <h2 className="mt-4 text-3xl font-bold text-text-primary md:text-5xl">
          Five connected capabilities. One system.
        </h2>
        <p className="mt-4 text-lg text-text-muted">
          Everything runs from the same operational context, so nothing needs
          re-entering.
        </p>
      </ScrollReveal>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {features.map((feature, i) => (
          <ScrollReveal key={feature.title} delay={i * 0.06}>
            <Link
              href={feature.href}
              className="group block h-full rounded-2xl border border-border-subtle bg-surface p-6 transition hover:-translate-y-1 hover:border-accent-primary/50 hover:shadow-card focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-subtle text-accent-strong transition group-hover:bg-accent-primary group-hover:text-text-inverse">
                <feature.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {feature.description}
              </p>
            </Link>
          </ScrollReveal>
        ))}
      </div>

      <div className="mt-24">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
            Built for every role
          </span>
          <h2 className="mt-4 text-3xl font-bold text-text-primary md:text-4xl">
            Value for every role
          </h2>
        </ScrollReveal>

        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {roles.map((role, i) => (
            <ScrollReveal
              key={role.title}
              delay={i * 0.08}
              className="text-center md:text-left"
            >
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent-subtle text-accent-strong md:mx-0">
                <role.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-text-primary">
                {role.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {role.description}
              </p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

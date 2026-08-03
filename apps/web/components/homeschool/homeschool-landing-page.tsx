import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, CheckCircle2, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import ProductReveal from "./product-reveal";
import WaitlistForm from "./waitlist-form";
import { homeschoolFaqs, homeschoolProductChapters } from "./homeschool-content";

type HomeschoolLandingPageProps = {
  directAnswer: {
    heading: string;
    body: string;
  };
};

const trustPrinciples = [
  {
    title: "Private by default",
    body: "Family records stay inside your household until you deliberately choose to share.",
  },
  {
    title: "Adults-only Community",
    body: "Mutual introductions and coarse locations protect families while making connection useful.",
  },
  {
    title: "Progress without scores",
    body: "Describe learning, evidence, and patterns without comparative or punitive language.",
  },
  {
    title: "UK-first preparedness",
    body: "Keep source details, review dates, evidence, and correspondence organised in one place.",
  },
];

export default function HomeschoolLandingPage({ directAnswer }: HomeschoolLandingPageProps) {
  return (
    <div className="overflow-clip bg-[#f4f1e8] text-[#263531]">
      <section className="relative isolate min-h-[calc(100svh-5rem)] overflow-hidden bg-[#173d36] text-[#fffdf5]">
        <div className="mx-auto grid min-h-[calc(100svh-5rem)] max-w-[90rem] items-center gap-12 px-5 py-20 sm:px-8 lg:px-12 lg:py-16 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="relative z-10 max-w-4xl">
            <p className="mb-7 text-xs font-bold uppercase tracking-[0.24em] text-[#8de0cf]">
              NexSteps Home · Early access
            </p>
            <h1 className="font-heading text-[clamp(3.8rem,8.2vw,8.4rem)] font-bold leading-[0.84] tracking-[-0.06em]">
              Home education.
              <span className="mt-2 block text-[#76D7C4]">Beautifully organised.</span>
            </h1>
            <p className="mt-9 max-w-2xl text-lg leading-8 text-[#d8e5e1] sm:text-2xl sm:leading-9">
              A calm homeschool planner for your family week, learning records, private community,
              and UK-first preparedness. All in one place.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="#waitlist"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#76D7C4] px-7 font-bold text-[#173d36] transition hover:bg-white"
              >
                Join the waiting list
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
              <a
                href="#family-week"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/35 px-7 font-bold transition hover:border-white hover:bg-white hover:text-[#173d36]"
              >
                See how it works
                <ArrowDown className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-7 flex items-center gap-2 text-sm text-[#b8cbc5]">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              No child data. No payment details. Just your place in line.
            </p>
          </div>

          <div className="relative mx-auto min-h-[38rem] w-full max-w-[38rem] sm:min-h-[60rem] xl:min-h-[52rem]">
            <div className="absolute left-0 top-16 w-[64%] -rotate-6 overflow-hidden rounded-[2.7rem] border border-white/15 bg-white shadow-[0_40px_100px_rgba(0,0,0,0.35)] sm:left-4 lg:top-20">
              <Image
                src="/images/homeschool/today.png"
                alt=""
                width={430}
                height={932}
                sizes="(max-width: 1024px) 58vw, 24rem"
                className="h-auto w-full"
                aria-hidden="true"
              />
            </div>
            <div className="absolute bottom-0 right-0 w-[72%] rotate-3 overflow-hidden rounded-[3rem] border border-white/20 bg-white shadow-[0_50px_120px_rgba(0,0,0,0.45)] sm:right-4">
              <Image
                src="/images/homeschool/week-home.png"
                alt="NexSteps Home showing a family week with learning, appointments and tasks"
                width={430}
                height={932}
                sizes="(max-width: 1024px) 68vw, 27rem"
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffdf7] px-5 py-24 sm:px-8 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#357267]">
            The short answer
          </p>
          <div>
            <h2 className="font-heading text-[clamp(2.8rem,6vw,6.4rem)] font-bold leading-[0.93] tracking-[-0.05em]">
              {directAnswer.heading}
            </h2>
            <p className="mt-8 max-w-4xl text-xl leading-9 text-[#50635e] sm:text-2xl sm:leading-10">
              {directAnswer.body}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#263531] px-5 py-20 text-[#fffdf7] sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8de0cf]">
            One family rhythm
          </p>
          <div className="mt-7 grid items-end gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <h2 className="font-heading text-[clamp(3rem,7vw,7rem)] font-bold leading-[0.9] tracking-[-0.055em]">
              From “what next?” to a week that flows.
            </h2>
            <p className="max-w-lg text-lg leading-8 text-[#c8d7d2]">
              Scroll through five connected parts of NexSteps Home. Each is designed to remove admin,
              keep context, and leave your family room to learn in its own way.
            </p>
          </div>
        </div>
      </section>

      <div aria-label="NexSteps Home product features">
        {homeschoolProductChapters.map((chapter, index) => (
          <ProductReveal key={chapter.id} chapter={chapter} index={index} />
        ))}
      </div>

      <section className="bg-[#173d36] px-5 py-24 text-[#fffdf7] sm:px-8 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8de0cf]">
              Designed around trust
            </p>
            <h2 className="mt-7 font-heading text-[clamp(3rem,7vw,7rem)] font-bold leading-[0.9] tracking-[-0.055em]">
              Useful structure. Family boundaries intact.
            </h2>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-[2rem] bg-white/20 sm:grid-cols-2 lg:grid-cols-4">
            {trustPrinciples.map((principle, index) => (
              <article key={principle.title} className="min-h-64 bg-[#173d36] p-7 sm:p-8">
                {index % 2 === 0 ? (
                  <ShieldCheck className="h-8 w-8 text-[#76D7C4]" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-8 w-8 text-[#FFD166]" aria-hidden="true" />
                )}
                <h3 className="mt-12 font-heading text-2xl font-bold">{principle.title}</h3>
                <p className="mt-4 leading-7 text-[#c8d7d2]">{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fffdf7] px-5 py-24 sm:px-8 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#357267]">
              Questions, answered
            </p>
            <h2 className="mt-7 font-heading text-[clamp(3rem,6vw,5.8rem)] font-bold leading-[0.92] tracking-[-0.05em]">
              Before you join.
            </h2>
            <p className="mt-7 max-w-md text-lg leading-8 text-[#5c6f69]">
              A clear view of what NexSteps Home is, who it is for, and how family privacy works.
            </p>
          </div>
          <div className="border-t border-[#cbd6d2]">
            {homeschoolFaqs.map((faq) => (
              <details key={faq.question} className="group border-b border-[#cbd6d2] py-2">
                <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left font-heading text-xl font-bold sm:text-2xl">
                  {faq.question}
                  <Plus
                    className="h-6 w-6 shrink-0 transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <p className="max-w-3xl pb-7 pr-10 text-base leading-8 text-[#5c6f69] sm:text-lg">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="scroll-mt-28 bg-[#263531] px-5 py-24 text-white sm:px-8 lg:py-32">
        <div className="mx-auto grid max-w-7xl items-start gap-14 xl:grid-cols-[0.9fr_1.1fr] xl:gap-20">
          <div className="xl:sticky xl:top-32">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8de0cf]">
              Early access
            </p>
            <h2 className="mt-7 font-heading text-[clamp(3.2rem,7vw,7rem)] font-bold leading-[0.88] tracking-[-0.055em]">
              Help shape what comes next.
            </h2>
            <p className="mt-8 max-w-xl text-xl leading-9 text-[#c8d7d2]">
              Join the NexSteps Home waiting list. Tell us where you are in your home-education
              journey, and we will keep you close to early access.
            </p>
          </div>
          <div className="w-full max-w-3xl justify-self-center xl:max-w-none">
            <WaitlistForm />
          </div>
        </div>
      </section>

      <section className="bg-[#76D7C4] px-5 py-20 text-center sm:px-8 lg:py-28">
        <p className="mx-auto max-w-5xl font-heading text-[clamp(2.6rem,6vw,6rem)] font-bold leading-[0.94] tracking-[-0.05em] text-[#173d36]">
          The structure you need. None of the school admin you do not.
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#173d36] px-6 font-bold text-[#173d36] transition hover:bg-[#173d36] hover:text-white"
        >
          Explore NexSteps
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/about");

export default function AboutPage() {
  return (
    <article>
      <section className="bg-[#203d36] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-center lg:gap-16">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#84dbc7]">
              Our story
            </p>
            <h1 className="mt-5 max-w-2xl font-heading text-4xl font-bold leading-tight md:text-6xl">
              Why I started Nexsteps
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85 md:text-xl">
              I wanted the people caring for children to spend less time
              managing paperwork and more time with them.
            </p>
            <p className="mt-8 text-base font-bold text-[#84dbc7]">
              Jean-Fidele, founder of Nexsteps
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl bg-[#2f5148]">
            <Image
              src="/images/about/jean-fidele.jpg"
              alt="Portrait of Jean-Fidele, founder of Nexsteps"
              width={1122}
              height={1402}
              sizes="(min-width: 1024px) 40vw, (min-width: 640px) 70vw, 100vw"
              className="aspect-[4/5] w-full object-cover object-center"
              priority
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-16 px-4 py-16 md:px-6 md:py-24">
        <section aria-labelledby="ministry-heading">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent-strong">
            Where it began
          </p>
          <h2
            id="ministry-heading"
            className="mt-3 text-3xl font-bold md:text-4xl"
          >
            More time with the children
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">
            I began building Nexsteps for the children&apos;s ministry I lead. I
            needed a dependable way to keep parents informed, safeguard
            children, and make attendance, learning records and everyday admin
            as painless as possible. My hope was that the team could give more
            of its time and attention to the children entrusted to us.
          </p>
        </section>

        <section aria-labelledby="learning-heading">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent-strong">
            How it grew
          </p>
          <h2
            id="learning-heading"
            className="mt-3 text-3xl font-bold md:text-4xl"
          >
            From ministry to learning centre
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">
            When my wife and I began homeschooling, we discovered Accelerated
            Christian Education (ACE). Around the same time, our church was
            starting a learning centre. I saw the same need on a larger scale:
            supervisors needed a clearer view of each child&apos;s work, and
            parents needed to be part of the conversation about their learning.
            Nexsteps grew from those experiences into a school management
            platform.
          </p>
        </section>

        <section aria-labelledby="mission-heading">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent-strong">
            The mission
          </p>
          <h2
            id="mission-heading"
            className="mt-3 text-3xl font-bold md:text-4xl"
          >
            Parents and schools, moving forward together
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">
            I believe parents have the responsibility to train up their children
            in the way they should go. Christian schools can support that
            calling by giving parents better access to their children&apos;s
            learning progress and deeper communication with teachers and
            supervisors. That partnership helps us decide the next step
            together.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">
            I am concerned when government interference draws schools away from
            their purpose. I want Nexsteps to help Christian schools keep clear
            records, meet their legal responsibilities and stay focused on the
            mission God has given them.
          </p>
        </section>
      </div>

      <section className="bg-[#203d36] px-4 py-16 text-white md:px-6 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold md:text-4xl">Forward together</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/85">
            Explore how Nexsteps can help your school see each child&apos;s
            progress more clearly and keep families in the conversation.
          </p>
          <Link
            href="/schools"
            className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#84dbc7] px-6 py-3 font-bold text-[#203d36] transition hover:bg-white focus-visible:ring-white"
          >
            Explore Nexsteps for schools
          </Link>
        </div>
      </section>
    </article>
  );
}

import type { HomeschoolRegion, HomeschoolStage } from "../../lib/leads-client";

export type HomeschoolProductChapter = {
  id: string;
  number: string;
  eyebrow: string;
  heading: string;
  answer: string;
  detail: string;
  imageSrc: string;
  imageAlt: string;
  accent: "mint" | "yellow" | "sky";
};

export type HomeschoolFaq = {
  question: string;
  answer: string;
};

export const homeschoolRegions: ReadonlyArray<{
  value: HomeschoolRegion;
  label: string;
}> = [
  { value: "england", label: "England" },
  { value: "wales", label: "Wales" },
  { value: "scotland", label: "Scotland" },
  { value: "northern-ireland", label: "Northern Ireland" },
  { value: "outside-uk", label: "Outside the UK" },
];

export const homeschoolStages: ReadonlyArray<{
  value: HomeschoolStage;
  label: string;
}> = [
  { value: "exploring", label: "I am exploring home education" },
  { value: "preparing", label: "I am preparing to begin" },
  { value: "home-educating", label: "I am currently home educating" },
  { value: "returning", label: "I am returning after a break" },
];

export const homeschoolProductChapters: ReadonlyArray<HomeschoolProductChapter> = [
  {
    id: "family-week",
    number: "01",
    eyebrow: "Your week, in one calm view",
    heading: "How can I organise our homeschool week?",
    answer:
      "Plan learning, tasks, appointments, and family commitments together, without recreating a school timetable at home.",
    detail:
      "Move with your family’s rhythm. Flexible weeks stay flexible, while everyone can still see what is happening next.",
    imageSrc: "/images/homeschool/week-home.png",
    imageAlt:
      "NexSteps Home family week showing learning, appointments and tasks in one mobile view",
    accent: "mint",
  },
  {
    id: "today",
    number: "02",
    eyebrow: "Today, without the noise",
    heading: "What needs our attention today?",
    answer:
      "See the next learning activity, task, and appointment without searching across calendars, notes, and messages.",
    detail:
      "A focused daily view keeps the useful structure and leaves room for curiosity, changes of plan, and small wins.",
    imageSrc: "/images/homeschool/today.png",
    imageAlt:
      "NexSteps Home today view with the next learning activity, appointment and a recorded small win",
    accent: "yellow",
  },
  {
    id: "learning-records",
    number: "03",
    eyebrow: "Progress that sounds like your family",
    heading: "How do I keep homeschool learning records?",
    answer:
      "Log learning and evidence as it happens, then see patterns over time without reducing a child’s learning to scores.",
    detail:
      "Photos, notes, subjects, and report-ready records stay connected, so reflection takes minutes rather than an evening of admin.",
    imageSrc: "/images/homeschool/progress-overview.png",
    imageAlt:
      "NexSteps Home progress overview with learning logs, evidence, subjects and report preparation",
    accent: "sky",
  },
  {
    id: "community",
    number: "04",
    eyebrow: "Good people, useful connections",
    heading: "Can I find other home-educating families safely?",
    answer:
      "Discover opted-in adults, mutual introductions, useful discussions, and public-place meetups through a privacy-first Community.",
    detail:
      "There is no infinite public feed. Children’s information stays private, exact home locations are never shown, and Community is off until you choose it.",
    imageSrc: "/images/homeschool/community-home.png",
    imageAlt:
      "NexSteps Home adults-only Community with nearby families, a public meetup and privacy status",
    accent: "mint",
  },
  {
    id: "preparedness",
    number: "05",
    eyebrow: "Prepared, not overwhelmed",
    heading: "How can I organise guidance and homeschool evidence?",
    answer:
      "Keep official information, family evidence, correspondence, and important dates together, with source and review details in view.",
    detail:
      "NexSteps helps organise information and your family’s evidence. It does not provide legal advice or guarantee compliance.",
    imageSrc: "/images/homeschool/regulations-overview.png",
    imageAlt:
      "NexSteps Home preparedness view with verified guidance, evidence links and correspondence dates",
    accent: "yellow",
  },
];

export const homeschoolFaqs: ReadonlyArray<HomeschoolFaq> = [
  {
    question: "What is NexSteps Home?",
    answer:
      "NexSteps Home is a homeschool planner and learning-record app for families. It brings weekly planning, daily focus, learning evidence, private community connections, and preparedness tools into one calm place.",
  },
  {
    question: "Is NexSteps Home only for families following a fixed curriculum?",
    answer:
      "No. It is designed for structured, flexible, autonomous, and mixed home-education approaches. Families choose their own rhythm, subjects, activities, and way of describing progress.",
  },
  {
    question: "Does NexSteps Home keep children’s information private?",
    answer:
      "Yes. Household records stay private by default. Community is adults-only and opt-in, and it does not expose child profiles, learning records, exact locations, or private contact details.",
  },
  {
    question: "Does NexSteps Home provide legal advice?",
    answer:
      "No. NexSteps Home helps families organise official information, correspondence, evidence, and important dates. It does not provide legal advice, legal representation, or a guarantee of compliance.",
  },
];

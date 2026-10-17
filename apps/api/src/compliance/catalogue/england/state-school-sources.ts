import { englandSource } from "./shared";

function law(
  id: string,
  path: string,
  title: string,
  provision: string,
  from: string | null,
) {
  return englandSource({
    id,
    url: `https://www.legislation.gov.uk/${path}`,
    title,
    authority: "UK Parliament / Secretary of State for Education",
    provision,
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication day not independently verified; enactment and commencement are distinct dates.",
    effective: {
      from,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason: from
        ? null
        : "Current text and applicable amendments verified; the cited provisions have different commencement dates.",
    },
  });
}
export const stateSchoolSources = [
  law(
    "eng-state-governance-roles",
    "uksi/2013/1624/regulation/6",
    "School Governance (Roles, Procedures and Allowances) (England) Regulations 2013",
    "Regulation 6: strategic oversight, educational performance, clerk and headteacher accountability",
    "2013-09-01",
  ),
  law(
    "eng-state-complaints-law",
    "ukpga/2002/32/section/29",
    "Education Act 2002: maintained-school complaints",
    "Section 29(1)–(2), read with section 39: complaints/publicising; maintained nursery exclusion in subsection (4) applies only to subsection (3)",
    "2003-09-01",
  ),
  law(
    "eng-state-balanced-curriculum",
    "ukpga/2002/32/section/78",
    "Education Act 2002: balanced and broadly based curriculum",
    "Section 78(1): maintained schools and maintained nursery schools; read with section 79 implementation duty",
    "2002-10-01",
  ),
  law(
    "eng-state-basic-curriculum",
    "ukpga/2002/32/section/80",
    "Education Act 2002: basic curriculum in England",
    "Section 80: national curriculum age scope and RE/relationships/health education exceptions; current amended provisions",
    null,
  ),
  law(
    "eng-state-academy-curriculum",
    "ukpga/2010/32/section/1A",
    "Academies Act 2010: Academy schools",
    "Section 1A(1)(b) and (2): current mainstream and special academy routes; substantive CWS2026 section 54 national-curriculum amendment not commenced as at review",
    "2012-04-01",
  ),
  law(
    "eng-state-send-support",
    "ukpga/2014/6/section/66",
    "Children and Families Act 2014: SEN support",
    "Section 66 best endeavours for listed institutions; read with section 83 mainstream and maintained-school definitions",
    "2014-09-01",
  ),
  law(
    "eng-state-senco",
    "ukpga/2014/6/section/67",
    "Children and Families Act 2014: SEN coordinators",
    "Section 67: designate SENCO in mainstream schools and maintained nursery schools; appointment/qualification exceptions require assessment",
    "2014-09-01",
  ),
  law(
    "eng-state-send-report",
    "ukpga/2014/6/section/69",
    "Children and Families Act 2014: SEN information report",
    "Section 69: maintained schools, maintained nursery schools and Academy schools; disabled admissions and accessibility information",
    "2014-09-01",
  ),
  law(
    "eng-state-send-publication",
    "uksi/2014/1530/part/3",
    "Special Educational Needs and Disability Regulations 2014",
    "Regulations 51–52 and Schedule 1: SEN report content, hospital-special-school exception and website publication; regulation 52 itself sets no annual update interval",
    "2014-09-01",
  ),
  law(
    "eng-state-ehcp-admission",
    "ukpga/2014/6/section/43",
    "Children and Families Act 2014: named EHC-plan admissions",
    "Section 43: named-plan duty for listed institutions, including section 41-approved independent institutions; current territorial amendments",
    null,
  ),
  law(
    "eng-state-admission-authority",
    "ukpga/1998/31/section/88",
    "School Standards and Framework Act 1998: admission authority",
    "Section 88: authority by legal school type, delegated authority and governing-body implementation of local-authority admission decisions",
    null,
  ),
  law(
    "eng-state-admission-arrangements",
    "ukpga/1998/31/section/88C",
    "School Standards and Framework Act 1998: admission arrangements",
    "Section 88C: authority determines, consults and notifies admission arrangements",
    "2009-01-26",
  ),
  law(
    "eng-state-la-cooperation",
    "ukpga/2026/21/section/61",
    "Children's Wellbeing and Schools Act 2026: school and local-authority cooperation",
    "Section 61 inserting SSFA1998 section 85ZA and EA1996 section 19B; commencement section 78(2), 29 June 2026",
    "2026-06-29",
  ),
  law(
    "eng-state-web-publication",
    "uksi/2012/1124/regulation/2",
    "School Information (England) (Amendment) Regulations 2012",
    "Regulation 2 substituting 2008 regulation 10 and introducing Schedule 4: website, free paper copies and updating; scope is 2008 regulation 2 Part 4 definition",
    "2012-09-01",
  ),
  law(
    "eng-state-web-complaints",
    "uksi/2016/451/regulation/2",
    "School Information (England) (Amendment) Regulations 2016",
    "Regulation 2(4): Schedule 4 paragraph 12A complaints publication; other provisions amend assessment and pupil-premium information",
    "2016-09-01",
  ),
  englandSource({
    id: "eng-state-academy-handbook",
    url: "https://www.gov.uk/government/publications/academy-trust-handbook/academy-trust-handbook-2026-effective-from-1-october-2026",
    title: "Academy Trust Handbook 2026",
    authority: "Department for Education",
    provision:
      "Introduction and Part 1: operational governance; compliance is a funding-agreement condition; detailed financial compliance outside this checklist version",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Edition updated 1 October 2026; original publication day not independently verified.",
    effective: { from: "2026-10-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-state-senco-qualification",
    url: "https://www.gov.uk/government/publications/mandatory-qualification-for-sencos/transition-to-national-professional-qualification-for-special-educational-needs-co-ordinators",
    title: "Mandatory SENCO qualification: transition guidance",
    authority: "Department for Education",
    provision:
      "NPQ from September 2024; three-year completion window and existing qualification/experience exceptions",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original issue day not independently verified.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Current guidance verified; different appointment cohorts and exemptions apply.",
    },
  }),
  englandSource({
    id: "eng-state-admissions-code",
    url: "https://www.gov.uk/government/publications/school-admissions-code--2",
    title: "School Admissions Code 2021",
    authority: "Department for Education",
    provision:
      "Applicable admission authorities: arrangements, applications, offers and fairness; subtype exclusions and separate appeals code",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Landing-page original publication concerns an earlier edition, not the 2021 code.",
    effective: { from: "2021-09-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-state-academy-publication",
    url: "https://www.gov.uk/guidance/what-academies-free-schools-and-colleges-should-publish-online",
    title:
      "What academies and further education colleges must or should publish online",
    authority: "Department for Education",
    provision:
      "Admissions, complaints, curriculum, governance and SEND; distinguishes statutory, funding-agreement and recommended publication; 16–19 complaints exception and admissions-code exclusions",
    classification: "GUIDANCE",
    publishedAt: "2016-06-30",
    publishedDateUnknownReason: null,
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Current guidance checked; individual legal and contractual obligations have different effective dates.",
    },
  }),
];

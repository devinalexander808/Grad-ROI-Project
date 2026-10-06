/**
 * Seed table of target jobs — SPEC.md §10: "Job title to SOC mapping is fuzzy.
 * Use O*NET's title crosswalk first; fall back to an AI suggestion the user
 * confirms. Seed a lookup table of the 50 most common target titles." The
 * first 20 covered the week 6 demo (§8); the rest broaden it to business, tech,
 * health, law and engineering. Every code was checked against BLS OEWS with
 * scripts/verify-occupations.ts and has a 2025 national median.
 *
 * SOC codes are 2018 SOC, six digits with no hyphen, the form BLS series IDs
 * want. Descriptions are one plain-language line each (§6: "Plain language
 * everywhere").
 */

export interface Occupation {
  /** 6-digit 2018 SOC code, no hyphen. */
  soc: string;
  title: string;
  description: string;
  /** Where the description came from when it is not one of ours, e.g. "O*NET OnLine". */
  descriptionSource?: string;
}

export const OCCUPATIONS: Occupation[] = [
  {
    soc: "132051",
    title: "Financial analyst",
    description:
      "Evaluates investments, budgets and business performance to guide money decisions.",
  },
  {
    soc: "152051",
    title: "Data scientist",
    description:
      "Builds models and pipelines that turn raw data into predictions and decisions.",
  },
  {
    soc: "132011",
    title: "Accountant or auditor",
    description:
      "Prepares and checks financial records, tax filings and internal controls.",
  },
  {
    soc: "131111",
    title: "Management analyst",
    description:
      "Studies how an organization works and recommends ways to run it better.",
  },
  {
    soc: "151252",
    title: "Software developer",
    description:
      "Designs and writes the applications and systems a business runs on.",
  },
  {
    soc: "113031",
    title: "Financial manager",
    description:
      "Runs an organization's finances: reporting, forecasting and capital planning.",
  },
  {
    soc: "131161",
    title: "Market research analyst",
    description:
      "Measures what customers want and how a product is selling, and why.",
  },
  {
    soc: "132052",
    title: "Personal financial advisor",
    description:
      "Advises individuals on saving, investing, insurance and retirement.",
  },
  {
    soc: "152031",
    title: "Operations research analyst",
    description:
      "Uses math and optimization to improve scheduling, routing and logistics.",
  },
  {
    soc: "113021",
    title: "Computer and information systems manager",
    description:
      "Leads the technology function: staff, systems, security and budget.",
  },
  {
    soc: "112021",
    title: "Marketing manager",
    description:
      "Owns demand: pricing, positioning, campaigns and the marketing team.",
  },
  {
    soc: "151212",
    title: "Information security analyst",
    description:
      "Defends networks and data, and investigates when something gets through.",
  },
  {
    soc: "151211",
    title: "Computer systems analyst",
    description:
      "Bridges business needs and IT systems, and specifies what to build or buy.",
  },
  {
    soc: "152041",
    title: "Statistician",
    description:
      "Designs studies and applies statistical methods to answer measured questions.",
  },
  {
    soc: "193011",
    title: "Economist",
    description:
      "Analyzes markets, labor and policy, usually with data and formal models.",
  },
  {
    soc: "131081",
    title: "Logistician",
    description:
      "Plans and coordinates a supply chain from purchase through delivery.",
  },
  {
    soc: "119111",
    title: "Medical or health services manager",
    description:
      "Runs a clinic, department or health system's operations and compliance.",
  },
  {
    soc: "131071",
    title: "Human resources specialist",
    description:
      "Recruits, onboards and supports employees, and administers benefits.",
  },
  {
    soc: "132031",
    title: "Budget analyst",
    description:
      "Builds and monitors budgets, mostly for government and large institutions.",
  },
  {
    soc: "132072",
    title: "Loan officer",
    description:
      "Evaluates and approves credit applications for people and businesses.",
  },
  {
    soc: "132041",
    title: "Credit analyst",
    description:
      "Judges whether a borrower can repay, and on what terms to lend.",
  },
  {
    soc: "132061",
    title: "Financial examiner",
    description:
      "Checks that banks and other lenders follow the law and stay solvent.",
  },
  {
    soc: "132081",
    title: "Tax examiner",
    description:
      "Reviews tax returns for accuracy and collects what is owed, usually for government.",
  },
  {
    soc: "132053",
    title: "Insurance underwriter",
    description:
      "Decides whether to insure a person or business, and at what price.",
  },
  {
    soc: "152011",
    title: "Actuary",
    description:
      "Uses math and statistics to price risk, mostly for insurers and pension plans.",
  },
  {
    soc: "131082",
    title: "Project management specialist",
    description:
      "Plans a project's schedule, budget and people, and keeps it on track.",
  },
  {
    soc: "131141",
    title: "Compensation and benefits specialist",
    description:
      "Sets pay ranges and runs benefit plans so they stay fair and competitive.",
  },
  {
    soc: "131151",
    title: "Training and development specialist",
    description:
      "Designs and runs the courses that teach employees new skills.",
  },
  {
    soc: "131051",
    title: "Cost estimator",
    description:
      "Works out what a building, product or service will cost to make.",
  },
  {
    soc: "131131",
    title: "Fundraiser",
    description:
      "Raises money for nonprofits, schools and campaigns from donors and grants.",
  },
  {
    soc: "151254",
    title: "Web developer",
    description:
      "Builds and maintains websites and the code behind them.",
  },
  {
    soc: "151242",
    title: "Database administrator",
    description:
      "Keeps an organization's databases running, backed up and secure.",
  },
  {
    soc: "151241",
    title: "Computer network architect",
    description:
      "Designs the networks that connect an organization's offices and systems.",
  },
  {
    soc: "151251",
    title: "Computer programmer",
    description:
      "Writes and tests code from designs that developers and engineers specify.",
  },
  {
    soc: "439021",
    title: "Data entry keyer",
    description:
      "Types data from forms and documents into computer systems.",
  },
  {
    soc: "433031",
    title: "Bookkeeping, accounting or auditing clerk",
    description:
      "Records day-to-day transactions and keeps the books in order.",
  },
  {
    soc: "111021",
    title: "General and operations manager",
    description:
      "Runs the day-to-day operations of a business or a large part of one.",
  },
  {
    soc: "112022",
    title: "Sales manager",
    description:
      "Leads a sales team, sets targets and decides where to sell.",
  },
  {
    soc: "113121",
    title: "Human resources manager",
    description:
      "Leads hiring, pay, benefits and employee relations for an organization.",
  },
  {
    soc: "113061",
    title: "Purchasing manager",
    description:
      "Leads the team that buys an organization's goods and services.",
  },
  {
    soc: "113131",
    title: "Training and development manager",
    description:
      "Leads an organization's training programs and the staff who run them.",
  },
  {
    soc: "193051",
    title: "Urban or regional planner",
    description:
      "Plans how land is used in towns and regions: housing, transit and parks.",
  },
  {
    soc: "413031",
    title: "Securities or financial services sales agent",
    description:
      "Buys and sells stocks, bonds and other financial products for clients.",
  },
  {
    soc: "419021",
    title: "Real estate broker",
    description:
      "Runs a real estate office and arranges property sales and rentals.",
  },
  {
    soc: "419022",
    title: "Real estate sales agent",
    description:
      "Helps people buy, sell and rent homes and other property.",
  },
  {
    soc: "413021",
    title: "Insurance sales agent",
    description:
      "Sells insurance policies to people and businesses.",
  },
  {
    soc: "291141",
    title: "Registered nurse",
    description:
      "Gives and coordinates patient care in hospitals, clinics and homes.",
  },
  {
    soc: "291171",
    title: "Nurse practitioner",
    description:
      "An advanced-practice nurse who diagnoses, treats and prescribes.",
  },
  {
    soc: "291071",
    title: "Physician assistant",
    description:
      "Examines, diagnoses and treats patients as part of a physician-led team.",
  },
  {
    soc: "291051",
    title: "Pharmacist",
    description:
      "Dispenses medicines and advises patients and doctors on their use.",
  },
  {
    soc: "291123",
    title: "Physical therapist",
    description:
      "Helps people recover movement and manage pain after injury or illness.",
  },
  {
    soc: "231011",
    title: "Lawyer",
    description:
      "Advises clients on the law and represents them in deals and disputes.",
  },
  {
    soc: "232011",
    title: "Paralegal or legal assistant",
    description:
      "Researches, drafts and organizes case files to support lawyers.",
  },
  {
    soc: "172051",
    title: "Civil engineer",
    description:
      "Designs roads, bridges, water systems and other public works.",
  },
  {
    soc: "172141",
    title: "Mechanical engineer",
    description:
      "Designs machines, engines and other mechanical devices.",
  },
  {
    soc: "172071",
    title: "Electrical engineer",
    description:
      "Designs electrical equipment, from power systems to motors and controls.",
  },
  {
    soc: "172112",
    title: "Industrial engineer",
    description:
      "Finds ways to cut waste in how products are made and services delivered.",
  },
  {
    soc: "252031",
    title: "Secondary school teacher",
    description:
      "Teaches one or more subjects to middle or high school students.",
  },
  {
    soc: "251011",
    title: "Business teacher, postsecondary",
    description:
      "Teaches business courses at a college or university and often does research.",
  },
];

export function findOccupation(soc: string): Occupation | null {
  return OCCUPATIONS.find((o) => o.soc === soc) ?? null;
}

/**
 * Case-insensitive substring match over title and description — the search
 * behind the §4.1 occupation picker. An empty query returns the whole table.
 */
export function searchOccupations(query: string): Occupation[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return OCCUPATIONS;
  return OCCUPATIONS.filter(
    (o) =>
      o.title.toLowerCase().includes(needle) ||
      o.description.toLowerCase().includes(needle) ||
      o.soc.includes(needle),
  );
}

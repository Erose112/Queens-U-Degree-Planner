import { Course, ProgramList, Wildcard } from "../types/plan";


function parseWildcard(wildcard: string): Wildcard {
  const tokens = wildcard.trim().split(" ");
  const subjectRaw = tokens[0]; // "CISC", "CISC_Subs", or "COGS_COMPUTING"

  const levelMatch = wildcard.match(/(\d)\d\d-level/);
  const level = levelMatch ? parseInt(levelMatch[1]) * 100 : null;
  const levelMin = /and above/.test(wildcard);

  const isNamed = subjectRaw.includes("_");

  const isPureList = isNamed && level === null;

  return {
    subject: isPureList ? null : subjectRaw.split("_")[0],
    level,
    levelMin,
    listName: isNamed ? subjectRaw : null,
  };
}

function filterCoursesByWildcard(
  courses: Course[],
  filter: Wildcard,
  namedLists: Record<string, string[]> = {},
  programLists: ProgramList[] = []           // ← new
): Course[] {
  let pool = courses;

  if (filter.listName) {
    const programList = programLists.find(l => l.list_name === filter.listName);
    if (programList) {
      pool = programList.courses;
    } else if (namedLists[filter.listName]) {
      // Fall back to legacy namedLists (course_code string arrays)
      const allowed = new Set(namedLists[filter.listName]);
      pool = pool.filter(c => allowed.has(c.course_code));
    } else {
      // Named list was specified but not found — return empty to avoid passing through all courses
      return [];
    }
  } else if (filter.subject) {
    pool = pool.filter(c => c.course_code.startsWith(filter.subject!));
  }

  // Level filter applies to all forms where a level is specified
  if (filter.level !== null) {
    pool = pool.filter(c => {
      const num = parseInt(c.course_code.replace(/\D/g, ""));
      return filter.levelMin
        ? num >= filter.level!
        : num >= filter.level! && num < filter.level! + 100;
    });
  }

  return pool;
}

export function splitWildcards(wildcard: string): Wildcard[] {
  return wildcard.split("|").map(segment => parseWildcard(segment.trim()));
}

export function filterCoursesByWildcards(
  courses: Course[],
  filters: Wildcard[],
  namedLists: Record<string, string[]> = {},
  programLists: ProgramList[] = []
): Course[] {
  const seen = new Set<string>();
  const result: Course[] = [];

  for (const filter of filters) {
    const matches = filterCoursesByWildcard(courses, filter, namedLists, programLists);
    for (const course of matches) {
      if (!seen.has(course.course_code)) {
        seen.add(course.course_code);
        result.push(course);
      }
    }
  }

  return result;
}
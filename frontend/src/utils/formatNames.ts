const DEGREE_MAP: Record<string, string> = {
  bs: "Bachelor of Science",
  ba: "Bachelor of Arts",
  bm: "Bachelor of Music",
  bmt: "Bachelor of Music Theatre",
  bc: "Bachelor of Computing",
};

export function formatProgramName(rawName: string): string {
  let name = rawName.replace(
    /\b(Specialization|Major|Minor|General|Honours)\b/gi,
    ""
  );

  name = name.replace(
    /\b(Science|Arts|Music|Computing)\s+(Bs|Ba|Bm|Bmt|Bc)\b/gi,
    (_match, _faculty, degree) => DEGREE_MAP[degree.toLowerCase()] ?? degree
  );

  name = name.replace(
    /(?<!of )\b(Science|Arts|Music|Computing)\b\s*$/gi, 
    ""
  );

  return name.replace(/\s+/g, " ").trim();
}

export function formatCourseName(code: string): string {
  return code.replace(/([A-Z]+)(\d+)/, "$1 $2");
}

export function getSectionLabel(index: number): string {
  return `Section ${index + 1}`;
}
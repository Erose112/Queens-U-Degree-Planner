const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api`;


// GET /courses/
export async function getCourses() {
  const res = await fetch(`${API_BASE}/courses/`);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

// GET /programs/
export async function getPrograms() {
  const res = await fetch(`${API_BASE}/programs/`);
  if (!res.ok) throw new Error("Failed to fetch programs");
  return res.json();
}

export async function getSubplans(programId: number) {
  const res = await fetch(`${API_BASE}/programs/${programId}/subplans`);
  if (!res.ok) throw new Error("Failed to fetch subplans");
  return res.json();
}

// GET /programs/{program_id}/structure
export async function getProgramStructure(programId: number) {
  const res = await fetch(`${API_BASE}/programs/${programId}/structure`);
  if (!res.ok) throw new Error("Failed to fetch program structure");
  return res.json();
}

// GET /programs/{program_id}/prerequisite-graph
export async function getPrerequisiteGraph(programId: number) {
  const res = await fetch(`${API_BASE}/programs/${programId}/prerequisite-graph`);
  if (!res.ok) throw new Error("Failed to fetch prerequisite graph");
  return res.json();
}

// GET /courses/{course_id}/prerequisites
export async function getPrerequisiteCourseGraph(courseId: number) {
  const res = await fetch(`${API_BASE}/courses/${courseId}/prerequisites`);
  if (!res.ok) throw new Error("Failed to fetch prerequisite course graph");
  return res.json();
}
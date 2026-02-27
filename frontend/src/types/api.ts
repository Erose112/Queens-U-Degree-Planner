const BASE_URL = import.meta.env.VITE_API_URL;

export async function fetchCoursePlan(id: string) {
  const response = await fetch(`${BASE_URL}/api/course-plan/${id}`);
  return response.json();
}

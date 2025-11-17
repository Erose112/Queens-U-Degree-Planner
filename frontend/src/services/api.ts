import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { Course, CoursePlan, Student, ApiResponse, PaginatedResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Course API
export const courseAPI = {
  getAllCourses: async (): Promise<Course[]> => {
    const response = await api.get<ApiResponse<Course[]>>('/courses');
    return response.data.data;
  },

  getCourse: async (id: string): Promise<Course> => {
    const response = await api.get<ApiResponse<Course>>(`/courses/${id}`);
    return response.data.data;
  },

  searchCourses: async (query: string): Promise<Course[]> => {
    const response = await api.get<ApiResponse<Course[]>>(`/courses/search`, {
      params: { q: query }
    });
    return response.data.data;
  },

  getCoursesByDepartment: async (department: string): Promise<Course[]> => {
    const response = await api.get<ApiResponse<Course[]>>(`/courses/department/${department}`);
    return response.data.data;
  },
};

// Planner API
export const plannerAPI = {
  generatePlan: async (studentData: Partial<Student>): Promise<CoursePlan> => {
    const response = await api.post<ApiResponse<CoursePlan>>('/plans/generate', studentData);
    return response.data.data;
  },

  savePlan: async (plan: Partial<CoursePlan>): Promise<CoursePlan> => {
    const response = await api.post<ApiResponse<CoursePlan>>('/plans', plan);
    return response.data.data;
  },

  getPlan: async (planId: string): Promise<CoursePlan> => {
    const response = await api.get<ApiResponse<CoursePlan>>(`/plans/${planId}`);
    return response.data.data;
  },
};

// Student API
export const studentAPI = {
  getProfile: async (studentId: string): Promise<Student> => {
    const response = await api.get<ApiResponse<Student>>(`/students/${studentId}`);
    return response.data.data;
  },

  updateProfile: async (studentId: string, data: Partial<Student>): Promise<Student> => {
    const response = await api.put<ApiResponse<Student>>(`/students/${studentId}`, data);
    return response.data.data;
  },
};

export default api;
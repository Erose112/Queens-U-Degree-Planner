import { Routes, Route } from 'react-router-dom';
import CoursePlanPage from './pages/CoursePlan';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';

export default function App() {
  return (
    <Routes> 
      <Route path="/" element={<HomePage />} />
      <Route path="/course-planner" element={<CoursePlanPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="*" element={<div>404 Not Found</div>} />
    </Routes>
  );
}
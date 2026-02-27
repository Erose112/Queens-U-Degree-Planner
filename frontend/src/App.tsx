import { Routes, Route } from 'react-router-dom';
import CoursePlanPage from './pages/CoursePlan';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <Routes> 
      <Route path="/" element={<HomePage />} />
      <Route path="/course-planner" element={<CoursePlanPage />} />
      <Route path="*" element={<div>404 Not Found</div>} />
    </Routes>
  );
}
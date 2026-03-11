import { Routes, Route, BrowserRouter } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlanPage';
import CoursePlanPage from './pages/CoursePlan';
import AboutPage from './pages/AboutPage';
import ScrollToTop from './components/ScrollToTop';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visualizer" element={<CoursePlanPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
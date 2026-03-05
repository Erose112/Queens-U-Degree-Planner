import { Routes, Route, BrowserRouter } from 'react-router-dom';
import CoursePlanPage from './pages/CoursePlan';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ScrollToTop from './components/ScrollToTop';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/course-planner" element={<CoursePlanPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
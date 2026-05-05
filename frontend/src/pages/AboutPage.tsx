import { useNavigate } from "react-router-dom";
import Navbar from "../components/NavBar";
import Footer from "../components/Footer";
import { COLOURS } from "../utils/colours";
import ScrollToTop from "../components/ScrollToTop";

const SOCIAL_LINKS = [
  {
    label: "GitHub",
    url: "https://github.com/Erose112",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    url: "https://www.linkedin.com/in/ethan-rose-3382b1344",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
];

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen" style={{ background: COLOURS.warmWhite }}>
      <ScrollToTop />
      <Navbar
        onHome={() => navigate("/")}
        onPlan={() => navigate("/planner")}
        activePage="About"
      />

      <main className="flex-1 w-full max-w-[900px] mx-auto px-10 py-11 flex flex-col gap-14">

        {/* Hero */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-6">
            <div>
              <h1
                className="font-playfair text-[34px] font-bold leading-tight"
                style={{ color: COLOURS.blue }}
              >
                Ethan Rose
              </h1>
              <p className="text-[16px] mt-1" style={{ color: COLOURS.darkGrey }}>
                Computer Science Student · Queen's University · Class of 2028
              </p>
            </div>
          </div>

          {/* Social links */}
          <div className="flex gap-3 flex-wrap">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[14px] font-medium transition-all"
                style={{
                  background: COLOURS.white,
                  color: COLOURS.blue,
                  border: `1px solid ${COLOURS.grey}`,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
                  textDecoration: "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${COLOURS.blue}10`)}
                onMouseLeave={e => (e.currentTarget.style.background = COLOURS.white)}
              >
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: COLOURS.grey }} />

        {/* About Me */}
        <div className="flex flex-col gap-4">
          <h2 className="font-playfair text-[24px] font-bold" style={{ color: COLOURS.blue }}>
            About Me
          </h2>
          <p className="text-[16px] leading-[1.75]" style={{ color: COLOURS.darkGrey }}>
            I'm a second-year Computer Science and Mathematics student passionate about building tools that make
            student life easier. I enjoy full-stack development, data-driven design, and turning
            frustrating problems into real life solutions.
          </p>
        </div>

        {/* Why I Built This */}
        <div
          className="flex gap-6 p-7 rounded-2xl"
          style={{
            background: COLOURS.white,
            border: `1px solid ${COLOURS.grey}`,
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-1"
            style={{ background: `${COLOURS.black}25`, color: COLOURS.black }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="font-playfair text-[22px] font-bold" style={{ color: COLOURS.blue }}>
              Why I Built This
            </h2>
            <p className="text-[16px] leading-[1.75]" style={{ color: COLOURS.darkGrey }}>
                I built this project out of my own frustration with the degree planning process at Queen's. 
                I wanted a simple way to visualise my degree progress, experiment with different course combinations, 
                and plan out my semesters without having to click through multiple pages on the university website. 
                Have fun planning!
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
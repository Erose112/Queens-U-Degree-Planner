import type { YearSection } from '../../utils/coursePlanConverter';
import { YEAR_BAR_WIDTH } from '../../utils/coursePlanLayout';
import { COLOURS } from "../../utils/colours";

interface YearSideBarProps {
  yearSections: YearSection[];
  translateY: number;
  scale: number;
}

export function YearSideBar({ yearSections, translateY, scale }: YearSideBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        right: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {yearSections.map((section, i) => {
        const isEven = i % 2 === 0;
        const barColor = isEven ? COLOURS.blue : `${COLOURS.blue}80`;
        const bgColor = isEven
          ? 'rgba(255, 255, 255, 0.6)'
          : `${COLOURS.blue}20`;

        return (
          <div
            key={section.year}
            style={{
              position: 'absolute',
              top: section.y * scale + translateY,
              left: 0,
              right: 0,
              height: section.height * scale,
              backgroundColor: bgColor,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: YEAR_BAR_WIDTH,
                backgroundColor: barColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  color: 'white',
                  fontSize: 15,
                  fontWeight: 500,
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  letterSpacing: '0.2em',
                  userSelect: 'none',
                  fontFamily: 'Arial, sans-serif',
                  textTransform: 'uppercase',
                }}
              >
                Year {section.year}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
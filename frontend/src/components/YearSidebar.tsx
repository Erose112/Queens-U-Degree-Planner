import type { YearSection } from '../utils/coursePlanConverter';
import { YEAR_BAR_WIDTH } from '../utils/coursePlanLayout';

interface YearSidebarProps {
  yearSections: YearSection[];
  translateY: number;
  scale: number;
}

export function YearSidebar({ yearSections, translateY, scale }: YearSidebarProps) {
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
        const barColor = isEven ? '#414447' : '#9ba2ab';
        // Background is the opposite — even year gets the lighter bg, odd gets darker
        const bgColor = isEven
          ? '#9ba2ab20'
          : '#41444740';

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
                  fontSize: 11,
                  fontWeight: 700,
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  letterSpacing: '0.05em',
                  userSelect: 'none',
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
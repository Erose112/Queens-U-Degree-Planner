import { COLOURS } from "../utils/colours";

interface NextPageButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
}

export default function NextPageButton({
  onClick,
  label = "Next",
  disabled = false,
  loading = false,
}: NextPageButtonProps) {
  return (
    <>
      <style>{`
        .next-btn {
          background: linear-gradient(135deg, ${COLOURS.blue} 0%, #2a3f6f 100%);
          color: ${COLOURS.white};
          border: none;
          border-radius: 50px;
          padding: 16px 48px;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 4px 14px ${COLOURS.blue}44;
          position: relative;
          overflow: hidden;
          min-width: 200px;
          justify-content: center;
        }

        .next-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #2a3f6f 0%, ${COLOURS.blue} 100%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .next-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px ${COLOURS.blue}55;
        }

        .next-btn:hover:not(:disabled)::before {
          opacity: 1;
        }

        .next-btn:active:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px ${COLOURS.blue}44;
        }

        .next-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .next-btn-content {
          display: flex;
          align-items: center;
          gap: 10px;
          position: relative;
          z-index: 1;
        }

        .next-btn-arrow {
          transition: transform 0.2s ease;
        }

        .next-btn:hover:not(:disabled) .next-btn-arrow {
          transform: translateX(4px);
        }

        .next-btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid ${COLOURS.white}55;
          border-top-color: ${COLOURS.white};
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <button
        onClick={onClick}
        disabled={disabled || loading}
        className="next-btn"
      >
        <span className="next-btn-content">
          {loading ? (
            <>
              <div className="next-btn-spinner" />
              Loading…
            </>
          ) : (
            <>
              {label}
              <svg
                className="next-btn-arrow"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </>
          )}
        </span>
      </button>
    </>
  );
}
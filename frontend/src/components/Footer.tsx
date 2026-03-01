import { COLOURS } from "../utils/colours";

export default function Footer() {
    return (
        <div>
            <footer
                className="text-center py-6 px-10 text-[13px]"
                style={{ background: COLOURS.blue, color: `${COLOURS.white}80` }}
            >
                Queen's Course Planner · For informational use only · Always verify with the official academic calendar.
            </footer>
        </div>
    );
}
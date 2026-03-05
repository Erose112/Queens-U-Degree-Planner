import {  useNavigate } from "react-router-dom";
import Navbar from "../components/NavBar";
import Footer from "../components/Footer";
import { COLOURS } from "../utils/colours";

export default function AboutPage() {
    const navigate = useNavigate();

    const handleHome = () => {
        navigate("/", {});
    }

    return (
        <div className="flex flex-col h-screen justify-between">
            <Navbar onHome={handleHome} activePage="About" />
            <Footer />
        </div>
        
    );
}
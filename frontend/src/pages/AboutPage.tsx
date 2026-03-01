import { useState, useRef, KeyboardEvent } from "react";
import {  useNavigate } from "react-router-dom";
import Navbar from "../components/NavBar";
import { COLOURS } from "../utils/colours";

export default function AboutPage() {
    const navigate = useNavigate();

    const handleHome = () => {
        navigate("/", {});
    }

    return (
        <Navbar onHome={handleHome} activePage="About" />
    );
}
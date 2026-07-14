import { createRoot } from "react-dom/client";
import { PopupApp } from "./PopupApp";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Popup root element is missing");
createRoot(root).render(<PopupApp />);

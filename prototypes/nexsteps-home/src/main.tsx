import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/latin-500.css";
// prototype.css declares "Quicksand" (body) and "Nunito" (headings) as the
// primary font-family, but neither was ever loaded - the reference
// screenshots have been rendering in the ui-rounded/SF Pro Rounded
// fallback. Load the real weights every selector in prototype.css uses.
// Quicksand's real cuts stop at 700 - CSS values above that (750, 800)
// rely on browser font-weight synthesis and have no matching real weight
// file; that is a genuine, documented web-only capability, not a missing
// import here.
import "@fontsource/quicksand/400.css";
import "@fontsource/quicksand/500.css";
import "@fontsource/quicksand/600.css";
import "@fontsource/quicksand/700.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import App from "./App";
import "./styles.css";
import "./prototype.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { globalStyles } from "./constants/theme";
import { WalletSessionProvider } from "./context/WalletSession";
import "@solana/wallet-adapter-react-ui/styles.css";

const style = document.createElement("style");
style.textContent = globalStyles;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletSessionProvider>
      <App />
    </WalletSessionProvider>
  </React.StrictMode>
);

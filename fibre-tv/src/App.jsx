import { useState } from "react";
import { ThemeProvider, CssBaseline, IconButton } from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";

import { material3 } from "./themes/material3";
import { liquidGlass } from "./themes/liquidGlass";

import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";

export default function App() {
  const [creds, setCreds] = useState(null);
  const [glass, setGlass] = useState(false);

  return (
    <ThemeProvider theme={glass ? liquidGlass : material3}>
      <CssBaseline />

      <IconButton
        onClick={() => setGlass(!glass)}
        sx={{ position: "fixed", top: 12, right: 12 }}
      >
        <SwapHorizIcon />
      </IconButton>

      {creds ? (
        <Dashboard creds={creds} />
      ) : (
        <Login onLogin={setCreds} />
      )}
    </ThemeProvider>
  );
}
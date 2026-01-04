import { createTheme } from "@mui/material/styles";

export const liquidGlass = createTheme({
  palette: {
      mode: "light",
          primary: { main: "#0A84FF" },
              background: {
                    default: "#F2F2F7",
                          paper: "rgba(255,255,255,0.65)"
                              }
                                },
                                  shape: { borderRadius: 28 },
                                    typography: {
                                        fontFamily: "-apple-system, BlinkMacSystemFont",
                                            h5: { fontWeight: 500 }
                                              },
                                                components: {
                                                    MuiCard: {
                                                          styleOverrides: {
                                                                  root: {
                                                                            backdropFilter: "blur(20px)",
                                                                                      boxShadow: "0 8px 30px rgba(0,0,0,0.12)"
                                                                                              }
                                                                                                    }
                                                                                                        }
                                                                                                          }
                                                                                                          });
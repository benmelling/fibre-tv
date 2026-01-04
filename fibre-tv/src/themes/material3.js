import { createTheme } from "@mui/material/styles";

export const material3 = createTheme({
  palette: {
      mode: "light",
          primary: { main: "#6750A4" },
              secondary: { main: "#625B71" },
                  background: {
                        default: "#FFFBFE",
                              paper: "#FFFFFF"
                                  }
                                    },
                                      shape: { borderRadius: 20 },
                                        typography: {
                                            fontFamily: "Roboto, system-ui",
                                                h5: { fontWeight: 600 }
                                                  }
                                                  });
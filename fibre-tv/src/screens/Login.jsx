import { Card, CardContent, Stack, TextField, Button, Typography } from "@mui/material";

export default function Login({ onLogin }) {
  const submit = e => {
      e.preventDefault();
          const d = new FormData(e.target);
              onLogin({
                    server: d.get("server"),
                          username: d.get("username"),
                                password: d.get("password")
                                    });
                                      };

                                        return (
                                            <Card sx={{ maxWidth: 420, mx: "auto", mt: 10 }}>
                                                  <CardContent>
                                                          <Typography variant="h5" mb={2}>Fibre TV</Typography>
                                                                  <form onSubmit={submit}>
                                                                            <Stack spacing={2}>
                                                                                        <TextField name="server" label="Server URL" required />
                                                                                                    <TextField name="username" label="Username" required />
                                                                                                                <TextField name="password" label="Password" type="password" required />
                                                                                                                            <Button variant="contained" size="large" type="submit">
                                                                                                                                          Connect
                                                                                                                                                      </Button>
                                                                                                                                                                </Stack>
                                                                                                                                                                        </form>
                                                                                                                                                                              </CardContent>
                                                                                                                                                                                  </Card>
                                                                                                                                                                                    );
                                                                                                                                                                                    }
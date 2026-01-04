import { useEffect, useState } from "react";
import { xtream } from "../api/xtream";
import { Grid, Card, CardContent, Typography } from "@mui/material";

export default function Dashboard({ creds }) {
  const [cats, setCats] = useState([]);

    useEffect(() => {
        xtream(creds, "get_live_categories").then(setCats);
          }, []);

            return (
                <Grid container spacing={2} p={2}>
                      {cats.map(c => (
                              <Grid item xs={6} sm={4} md={3} key={c.category_id}>
                                        <Card>
                                                    <CardContent>
                                                                  <Typography>{c.category_name}</Typography>
                                                                              </CardContent>
                                                                                        </Card>
                                                                                                </Grid>
                                                                                                      ))}
                                                                                                          </Grid>
                                                                                                            );
                                                                                                            }
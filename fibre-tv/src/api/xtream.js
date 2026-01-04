export async function xtream(creds, action) {
  const base = creds.server.replace(/\/$/, "");
  const url = `${base}/player_api.php?username=${creds.username}&password=${creds.password}&action=${action}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Xtream API error");
  return res.json();
}
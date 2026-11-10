export async function onRequestGet() {
  const response = await fetch("https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx", {
    headers: { "Cache-Control": "no-cache" },
  });

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

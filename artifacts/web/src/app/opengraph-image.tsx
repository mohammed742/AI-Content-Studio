import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "AI Content Studio — AI-powered social content for small businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: "72px",
            fontWeight: "bold",
            marginBottom: "24px",
            letterSpacing: "-2px",
          }}
        >
          AI Content Studio
        </div>
        <div
          style={{ fontSize: "32px", color: "#a1a1aa", fontWeight: "400" }}
        >
          AI-Powered Social Content for Small Businesses
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

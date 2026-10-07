import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Text-based favicon matching the wordmark — no raster asset, no Shopee marks.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#7A4B32",
        color: "#FDF8F0",
        fontSize: 20,
        fontWeight: 800,
        borderRadius: 6,
      }}
    >
      T
    </div>,
    size,
  );
}

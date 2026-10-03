import localFont from "next/font/local";

/** Peyda: the Persian (and Arabic-script) face. Latin text keeps Geist. */
export const peyda = localFont({
  src: [
    { path: "./PeydaWeb-Regular.woff2", weight: "400", style: "normal" },
    { path: "./PeydaWeb-Medium.woff2", weight: "500", style: "normal" },
    { path: "./PeydaWeb-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./PeydaWeb-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-peyda",
  display: "swap",
  preload: false,
});

export default function manifest() {
  return {
    name: "The Buyzaar Mart",
    short_name: "Buyzaar Mart",
    description: "Shop live inventory from your neighbourhood Buyzaar Mart.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#b00000",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

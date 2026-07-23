import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./storefront.css";
import { StoreProvider } from "@/context/StoreContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "The Buyzaar Mart | Shop Your Local Store",
    template: "%s | The Buyzaar Mart",
  },
  description:
    "Shop live local inventory, store-wise prices, groceries and everyday essentials from The Buyzaar Mart.",
  icons: {
    icon: "/buyzaar-logo.png",
    shortcut: "/buyzaar-logo.png",
    apple: "/buyzaar-logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><StoreProvider>{children}</StoreProvider></body>
    </html>
  );
}

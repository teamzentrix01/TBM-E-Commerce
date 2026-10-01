import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./storefront.css";
import "./shop.css";
import { StoreProvider } from "@/context/StoreContext";
import { CartSessionProvider } from "@/context/CartSessionContext";
import MobileBottomNav from "@/components/MobileBottomNav";
import { FlyToCartProvider } from "@/components/shop/FlyToCart";
import MobileCartBar from "@/components/MobileCartBar";
import PWARegister from "@/components/PWARegister";
import AppExperience from "@/components/AppExperience";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Buyzaar Mart",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/favicon.png",
  },
  title: {
    default: "The Buyzaar Mart | Shop Your Local Store",
    template: "%s | The Buyzaar Mart",
  },
  description:
    "Shop live local inventory, store-wise prices, groceries and everyday essentials from The Buyzaar Mart.",
};

export const viewport = {
  themeColor: "#b00000",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bz-app-body">
        <StoreProvider>
          <CartSessionProvider>
            <FlyToCartProvider>
              {children}
              <MobileCartBar />
              <MobileBottomNav />
              <PWARegister />
              <AppExperience />
            </FlyToCartProvider>
          </CartSessionProvider>
        </StoreProvider>
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "ShelfWise",
  description: "Restaurant Inventory Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
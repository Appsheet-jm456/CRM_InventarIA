import "./globals.css";

export const metadata = {
  title: "InventarIA · Consulta de inventario",
  description: "Chat interno para consultar el inventario del local.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

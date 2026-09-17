import './globals.css';

export const metadata = {
  title: 'Apple Fulfillment Monitor'
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

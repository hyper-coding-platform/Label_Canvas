import { PRODUCTS } from "@/lib/erp-data";

export default function Dashboard() {
  return (
    <>
      <h1>Dashboard</h1>
      <p>{PRODUCTS.length} products in stock.</p>
    </>
  );
}

import { PRODUCTS, toLabelRecord } from "@/lib/erp-data";
import { templateStore } from "@/lib/template-store";
import { PrintBatch } from "./print-batch";

export const dynamic = "force-dynamic";

export default async function PrintPage() {
  const stored = await templateStore.get("textile-hang-tag");
  if (!stored) return <p>Template not found.</p>;
  return (
    <>
      <h1>Print labels</h1>
      <p>
        Server-rendered SVG via the core renderer: <a href={`/api/labels/textile-hang-tag/${PRODUCTS[0]!.id}`}>{PRODUCTS[0]!.name}</a>
      </p>
      <PrintBatch template={stored.template} records={PRODUCTS.map(toLabelRecord)} />
    </>
  );
}
